export interface GroundedReviewSnippet {
  text: string;
  author?: string;
}

export interface GroundedPlaceLink {
  title: string;
  uri: string;
  placeId: string | null;
  reviewSnippets: GroundedReviewSnippet[];
}

export interface MapsGroundingResponse {
  answerText: string;
  places: GroundedPlaceLink[];
}

interface RawGroundingChunk {
  maps?: {
    uri?: unknown;
    title?: unknown;
    placeId?: unknown;
    placeAnswerSources?: {
      reviewSnippets?: Array<{
        content?: unknown;
        text?: unknown;
        author?: unknown;
      }>;
    };
  };
}

/**
 * Extracts clickable Google Maps grounding chunks and review snippets
 * from Gemini API `candidates[0].groundingMetadata.groundingChunks`.
 */
export function extractMapsGroundingPlaces(rawChunks: unknown): GroundedPlaceLink[] {
  if (!Array.isArray(rawChunks)) return [];

  const seenUris = new Set<string>();
  const results: GroundedPlaceLink[] = [];

  for (const item of rawChunks as RawGroundingChunk[]) {
    const maps = item?.maps;
    if (!maps || typeof maps.uri !== 'string') continue;

    const uri = maps.uri.trim();
    if (!uri.startsWith('https://')) continue;
    if (seenUris.has(uri)) continue;
    seenUris.add(uri);

    const title =
      typeof maps.title === 'string' && maps.title.trim().length > 0
        ? maps.title.trim().slice(0, 160)
        : 'Google Maps Location';

    const placeId =
      typeof maps.placeId === 'string' && maps.placeId.trim().length > 0
        ? maps.placeId.trim().slice(0, 200)
        : null;

    const rawSnippets = Array.isArray(maps.placeAnswerSources?.reviewSnippets)
      ? maps.placeAnswerSources.reviewSnippets
      : [];

    const reviewSnippets: GroundedReviewSnippet[] = [];
    for (const snippet of rawSnippets.slice(0, 3)) {
      const textVal =
        typeof snippet?.content === 'string'
          ? snippet.content
          : typeof snippet?.text === 'string'
            ? snippet.text
            : '';
      const trimmedText = textVal.trim();
      if (!trimmedText) continue;
      reviewSnippets.push({
        text: trimmedText.slice(0, 280),
        author:
          typeof snippet?.author === 'string' && snippet.author.trim().length > 0
            ? snippet.author.trim().slice(0, 80)
            : undefined,
      });
    }

    results.push({
      title,
      uri,
      placeId,
      reviewSnippets,
    });
  }

  return results;
}

export type SavedPlaceCategory = 'pharmacy' | 'clinic' | 'urgent_care' | 'other';

export function inferPlaceCategory(label: string): SavedPlaceCategory {
  const lower = label.toLowerCase();
  if (lower.includes('pharm') || lower.includes('drug') || lower.includes('rx')) {
    return 'pharmacy';
  }
  if (lower.includes('urgent')) {
    return 'urgent_care';
  }
  if (lower.includes('clinic') || lower.includes('health') || lower.includes('medical')) {
    return 'clinic';
  }
  return 'other';
}

export function isQuotaExceededMessage(text: string): boolean {
  return (
    text.includes('OverQuotaMapError') ||
    text.includes('QuotaExceededError') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('RESOURCE_EXHAUSTED')
  );
}
