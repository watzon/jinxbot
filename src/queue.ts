import { Evt } from "evt";

// Txt2Img Queue implementation.
// The AUTOMATIC1111 webui doesn't provide API access to its queue (at least not in a
// way that is useful) so it's up to this class to implement a queue that can be
// accessed programatically.
//
// This queue is async aware, meaning that it accepts async functions as queue items.
// As those functions finish executing they will be removed from the queue, and
// their results will be returned to the caller.
//
// The position of each item in the queue is also tracked. Upon completion of an
// item, the queue will emit an event with each item's position in the queue.
// This is useful for tracking the progress of the queue.
export class Queue {
  private readonly queue: QueueJob<unknown>[] = [];
  private running = false;

  // Add an item to the queue, returning a promise that will resolve when the item
  // is finished, as well as the position of the item in the queue.
  add<T>(item: Promise<T>): QueueJob<T> {
    const job = new QueueJob<T>(item);
    this.queue.push(job);
    job.position = this.queue.length;
    this.run();
    return job;
  }

  // Remove an item from the queue. This will not cancel the item if it is currently
  // running.
  remove(job: QueueJob<unknown>) {
    this.removeById(job.id);
  }

  // Remove a job from the queue by its ID.
  removeById(id: string) {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    this.queue[index].cancel();
    this.queue.splice(index, 1);
    this.queue.forEach((item) => {
      item.position -= 1;
    });
  }

  // Run the queue. This will execute the next item in the queue, and then call
  // itself recursively until the queue is empty.
  private async run() {
    if (this.running) {
      return;
    }
    this.running = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await item.wait();
      item.position = 0;
      this.queue.forEach((item) => {
        item.position -= 1;
      });
    }
    this.running = false;
  }
}

export class QueueJob<T> {
  public id: string;
  private _position = 0;
  private _onPositionChange = Evt.create<number>();
  private _onCanceled = Evt.create<void>();

  constructor(
    private readonly promise: Promise<T>,
  ) {
    // Set the id to a random 12 character string.
    this.id = Math.random().toString(36).slice(2, 14);
  }

  wait(): Promise<T> {
    return this.promise;
  }

  cancel() {
    this.promise.catch(() => {});
    this._onCanceled.post();
  }

  get position(): number {
    return this._position;
  }

  set position(value: number) {
    this._position = value;
    if (this._position === 0) {
      this._onPositionChange.detach();
    } else {
      this._onPositionChange.post(value);
    }
  }

  onPositionChange(handler: (position: number) => void) {
    this._onPositionChange.attach(handler);
  }

  onCanceled(handler: () => void) {
    this._onCanceled.attach(handler);
  }
}
