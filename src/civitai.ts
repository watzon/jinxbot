// This file contains an API client for civitai.com

const API_URL = "https://civitai.com/api/v1";

export interface PaginatedResponse<T> {
  items: T[];
  metadata: {
    totalItems: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    prevPage?: string;
    nextPage?: string;
  };
}

export interface Creator {
  username: string;
  modelCount: number;
  link: string;
}

export interface Image {
  id: number;
  url: string;
  hash: string;
  width: number;
  height: number;
  nsfw: boolean;
  nsfwLevel: "None" | "Soft" | "Mature" | "X";
  createdAt: string;
  postId: number;
  stats: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    heartCount: number;
    commentCount: number;
  };
  meta: Record<string, string>;
  username: string;
}

export interface Model {
  id: number;
  name: string;
  description: string;
  type:
    | "Checkpoint"
    | "TextualInversion"
    | "Hypernetwork"
    | "AestheticGradient"
    | "LORA"
    | "Controlnet"
    | "Poses";
  nsfw: boolean;
  tags: string[];
  mode: "Archived" | "TakenDown";
  creator: {
    username: string;
    image?: string;
  };
  stats: {
    downloadCount: number;
    favoriteCount: number;
    commentCount: number;
    ratingCount: number;
    rating: number;
  };
  modelVersions: ModelVersion[];
}

export interface ModelVersion {
  id: number;
  modelId: number;
  name: string;
  description: string;
  createdAt: string;
  downloadUrl: string;
  trainedWords: number;
  baseModel?: string;
  baseModelType?: string;
  earlyAccessTimeFrame?: string;
  files: {
    name: string;
    id: number;
    sizeKb: number;
    pickleScanResult: "Pending" | "Success" | "Danger" | "Error";
    virusScanResult: "Pending" | "Success" | "Danger" | "Error";
    scannedAt?: string;
    primary?: boolean;
    metadata: {
      fp?: "fp16" | "fp32";
      size?: "full" | "pruned";
      format?: "SafeTensor" | "PickleTensor" | "Other";
    };
    hashes: {
      AutoV1?: string;
      AutoV2?: string;
      SHA256?: string;
      CRC32?: string;
      BLAKE3?: string;
    };
    downloadUrl: string;
  }[];
  images: Omit<Image, "modelId" | "nsfwLevel" | "createdAt" | "stats">[];
  stats: {
    downloadCount: number;
    ratingCount: number;
    rating: number;
  };
  model: {
    name: string;
    type: string;
    nsfw: boolean;
    poi: boolean;
  };
}

export interface Tag {
  name: string;
  modelCount: number;
  link: string;
}

// This is returned by API methods which return a paginated response. It transparently
// wraps the inner response type and provides a method to
// fetch the next page of results.
export class Cursor<T> {
  constructor(
    private readonly api: CivitAI,
    private readonly method: string,
    private readonly params: Record<string, unknown>,
    private readonly response: PaginatedResponse<T>,
  ) {}

  // Fetch the next page of results
  async next(): Promise<Cursor<T> | null> {
    if (!this.response.metadata.nextPage) {
      return null;
    }
    const params = {
      ...this.params,
      page: this.response.metadata.currentPage + 1,
    };
    const response = await this.api.request(this.method, params);
    return new Cursor(
      this.api,
      this.method,
      this.params,
      response as PaginatedResponse<T>,
    );
  }

  // Get the previos page of results
  async prev(): Promise<Cursor<T> | null> {
    if (!this.response.metadata.prevPage) {
      return null;
    }
    const params = {
      ...this.params,
      page: this.response.metadata.currentPage - 1,
    };
    const response = await this.api.request(this.method, params);
    return new Cursor(
      this.api,
      this.method,
      this.params,
      response as PaginatedResponse<T>,
    );
  }

  // Get the items in the current page
  get items(): T[] {
    return this.response.items;
  }

  // Get the metadata for the current page
  get metadata(): PaginatedResponse<T>["metadata"] {
    return this.response.metadata;
  }

  // Get the total number of items
  get totalItems(): number {
    return this.response.metadata.totalItems;
  }

  // Get the current page number
  get currentPage(): number {
    return this.response.metadata.currentPage;
  }

  // Get the number of items per page
  get pageSize(): number {
    return this.response.metadata.pageSize;
  }

  // Get the total number of pages
  get totalPages(): number {
    return this.response.metadata.totalPages;
  }
}

export class CivitAI {
  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const query = new URLSearchParams(
      params as Record<string, string>,
    ).toString();
    const url = `${API_URL}/${method}?${query}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const json = await response.json();
    if (response.status !== 200) {
      throw new Error(json);
    }

    return json as T;
  }

  // Get a list of creators
  async getCreators(
    params: { limit?: number; page?: number; query?: string } = {},
  ): Promise<Cursor<Creator>> {
    const response = await this.request<PaginatedResponse<Creator>>(
      "creators",
      params,
    );
    return new Cursor(this, "creators", params, response);
  }

  // Get a list of images
  async getImages(
    params: {
      limit?: number;
      postId?: number;
      modelId?: number;
      modelVersionId?: number;
      username?: string;
      nsfw?: boolean | "Soft" | "Mature" | "X";
      sort?: "Most Reactions" | "Most Comments" | "Newest";
      period?: "AllTime" | "Year" | "Month" | "Week" | "Day";
      page?: number;
    } = {},
  ): Promise<Cursor<Image>> {
    const response = await this.request<PaginatedResponse<Image>>(
      "images",
      params,
    );
    return new Cursor(this, "images", params, response);
  }

  // Get a list of models
  async getModels(
    params: {
      limit?: number;
      page?: number;
      query?: string;
      tag?: string;
      username?: string;
      types?: string[];
      sort?: "Highest Rated" | "Most Downloaded" | "Newest";
      period?: "AllTime" | "Year" | "Month" | "Week" | "Day";
      rating?: number;
      favorites?: boolean;
      hidden?: boolean;
      primaryFileOnly?: boolean;
      allowNoCredit?: boolean;
      allowDerivatives?: boolean;
      allowDifferentLicenses?: boolean;
      allowCommercialUse?: boolean;
      nsfw?: boolean;
    } = {},
  ): Promise<Cursor<Model>> {
    const response = await this.request<PaginatedResponse<Model>>(
      "models",
      params,
    );
    return new Cursor(this, "models", params, response);
  }

  // Get a model by its ID
  async getModelById(id: number): Promise<Model> {
    return await this.request<Model>(`models/${id}`);
  }

  // Get a model version by its id
  async getModelByVersionId(id: number): Promise<ModelVersion> {
    return await this.request<ModelVersion>(`model-versions/${id}`);
  }

  // Get a model version by its hash
  async getModelByVersionHash(hash: string): Promise<ModelVersion> {
    return await this.request<ModelVersion>(`model-versions/by-hash/${hash}`);
  }

  // Get a list of tags
  async getTags(
    options: { limit?: number; page?: number; query?: string } = {},
  ): Promise<Cursor<Tag>> {
    const response = await this.request<PaginatedResponse<Tag>>(
      "tags",
      options,
    );
    return new Cursor(this, "tags", options, response);
  }
}
