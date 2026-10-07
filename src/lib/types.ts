export type ArtworkKind = "illustration" | "video" | "photo" | "design";
export type ReviewStatus = "inbox" | "reviewing" | "reviewed";

export interface Artwork {
  id: string;
  title: string;
  url: string;
  creator: string;
  kind: ArtworkKind;
  tags: string[];
  description: string;
  notes: string;
  collection: string;
  favorite: boolean;
  status: ReviewStatus;
  imageUrl?: string;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  revision: number;
}

export type ArtworkDraft = Omit<
  Artwork,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "revision"
>;
export type ArtworkPatch = Partial<ArtworkDraft>;

export interface Comment {
  id: string;
  artworkId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface LibraryState {
  artworks: Artwork[];
  comments: Comment[];
}

export interface LibraryUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface SearchFilters {
  kind?: ArtworkKind | "all";
  collection?: string;
  tags?: string[];
  favorite?: boolean;
  status?: ReviewStatus;
}

export interface SearchResult {
  artwork: Artwork;
  score: number;
  matchedFields: string[];
}
