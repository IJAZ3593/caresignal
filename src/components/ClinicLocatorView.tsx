/// <reference types="google.maps" />
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import type { User } from 'firebase/auth';
import { motion } from 'motion/react';
import {
  Bookmark,
  BookmarkCheck,
  Crosshair,
  ExternalLink,
  MapPin,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  removeSavedPlaceFromFirestore,
  savePlaceToFirestore,
  type SavedPlaceRecord,
} from '../lib/firestoreSync';
import {
  inferPlaceCategory,
  isQuotaExceededMessage,
  type GroundedPlaceLink,
  type MapsGroundingResponse,
} from '../lib/mapsHelpers';
import type { ClinicSettings } from '../lib/types';

interface DiscoveredPlace {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  businessStatus?: string;
  googleMapsURI?: string;
}

interface ClinicLocatorViewProps {
  clinic: ClinicSettings;
  theme: 'light' | 'dark';
  firebaseUser: User | null;
  savedPlaces: SavedPlaceRecord[];
  onOpenAuth: () => void;
}

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

const QUICK_GROUNDING_PROMPTS = [
  '24-hour pharmacies nearby',
  'Vaccination clinics open today',
  'Community urgent care centers nearby',
];

function MapsStatusWatcher({ onAuthFailure }: { onAuthFailure: () => void }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onAuthFailure();
    }
  }, [status, onAuthFailure]);
  return null;
}

interface InnerMapContentProps {
  center: { lat: number; lng: number };
  clinic: ClinicSettings;
  places: DiscoveredPlace[];
  selectedPlace: DiscoveredPlace | null;
  onSelectPlace: (place: DiscoveredPlace | null) => void;
  onSearchResults: (results: DiscoveredPlace[]) => void;
  onPlacesError: (msg: string | null) => void;
  searchTrigger: { query: string; nonce: number } | null;
  nearbyTrigger: number;
  theme: 'light' | 'dark';
  firebaseUser: User | null;
  savedPlaceIds: Set<string>;
  onSavePlace: (place: {
    placeId: string;
    title: string;
    mapsUri: string;
  }) => Promise<void>;
  onOpenAuth: () => void;
}

function InnerMapContent({
  center,
  clinic,
  places,
  selectedPlace,
  onSelectPlace,
  onSearchResults,
  onPlacesError,
  searchTrigger,
  nearbyTrigger,
  theme,
  firebaseUser,
  savedPlaceIds,
  onSavePlace,
  onOpenAuth,
}: InnerMapContentProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [clinicInfoOpen, setClinicInfoOpen] = useState(false);

  const runNearbySearch = useCallback(async () => {
    if (!placesLib) return;
    onPlacesError(null);
    try {
      const request: google.maps.places.SearchNearbyRequest & {
        internalUsageAttributionIds?: string[];
      } = {
        fields: [
          'id',
          'displayName',
          'location',
          'formattedAddress',
          'businessStatus',
          'googleMapsURI',
        ],
        locationRestriction: {
          center,
          radius: 4000,
        },
        includedPrimaryTypes: ['pharmacy', 'drugstore'],
        maxResultCount: 8,
        language: 'en-US',
        region: 'us',
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      };

      const { places: found } = await placesLib.Place.searchNearby(request);
      const mapped: DiscoveredPlace[] = (found ?? [])
        .filter((p: google.maps.places.Place) => Boolean(p.location))
        .map((p: google.maps.places.Place) => ({
          id: p.id,
          name: p.displayName || 'Pharmacy',
          address: p.formattedAddress || 'Address available on Google Maps',
          location: {
            lat: p.location!.lat(),
            lng: p.location!.lng(),
          },
          businessStatus: p.businessStatus ?? undefined,
          googleMapsURI: p.googleMapsURI ?? undefined,
        }));
      onSearchResults(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isQuotaExceededMessage(msg)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      onPlacesError(
        'Nearby place lookup could not load right now. You can still use Grounded Map Search below.'
      );
    }
  }, [placesLib, center, onSearchResults, onPlacesError]);

  const runTextSearch = useCallback(
    async (queryText: string) => {
      if (!placesLib || !queryText.trim()) return;
      onPlacesError(null);
      try {
        const request: google.maps.places.SearchByTextRequest & {
          internalUsageAttributionIds?: string[];
        } = {
          textQuery: queryText.trim(),
          fields: [
            'id',
            'displayName',
            'location',
            'formattedAddress',
            'businessStatus',
            'googleMapsURI',
          ],
          locationBias: center,
          maxResultCount: 8,
          language: 'en-US',
          region: 'us',
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        };
        const { places: found } = await placesLib.Place.searchByText(request);
        const mapped: DiscoveredPlace[] = (found ?? [])
          .filter((p: google.maps.places.Place) => Boolean(p.location))
          .map((p: google.maps.places.Place) => ({
            id: p.id,
            name: p.displayName || 'Healthcare Location',
            address: p.formattedAddress || 'Address available on Google Maps',
            location: {
              lat: p.location!.lat(),
              lng: p.location!.lng(),
            },
            businessStatus: p.businessStatus ?? undefined,
            googleMapsURI: p.googleMapsURI ?? undefined,
          }));
        onSearchResults(mapped);
        if (mapped[0]?.location && map) {
          map.panTo(mapped[0].location);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isQuotaExceededMessage(msg)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onPlacesError('Unable to complete text search on Google Maps right now.');
      }
    },
    [placesLib, center, map, onSearchResults, onPlacesError]
  );

  useEffect(() => {
    if (map) {
      map.panTo(center);
    }
  }, [map, center]);

  useEffect(() => {
    if (nearbyTrigger > 0) {
      void runNearbySearch();
    }
  }, [nearbyTrigger, runNearbySearch]);

  useEffect(() => {
    if (searchTrigger && searchTrigger.nonce > 0) {
      void runTextSearch(searchTrigger.query);
    }
  }, [searchTrigger, runTextSearch]);

  return (
    <GoogleMap
      defaultCenter={center}
      defaultZoom={13}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Demo clinic anchor marker */}
      <AdvancedMarker
        position={center}
        title={clinic.clinicName}
        onClick={() => {
          onSelectPlace(null);
          setClinicInfoOpen(true);
        }}
      >
        <Pin background="#0f766e" borderColor="#115e59" glyphColor="#ffffff" />
      </AdvancedMarker>

      {clinicInfoOpen && (
        <InfoWindow
          position={center}
          onCloseClick={() => setClinicInfoOpen(false)}
        >
          <div className="max-w-xs p-1 text-slate-900">
            <p className="text-xs font-semibold">{clinic.clinicName}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{clinic.address}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{clinic.hours}</p>
          </div>
        </InfoWindow>
      )}

      {/* Places API (New) discovered markers */}
      {places.map((place) => {
        const isSelected = selectedPlace?.id === place.id;
        return (
          <AdvancedMarker
            key={place.id}
            position={place.location}
            title={place.name}
            zIndex={isSelected ? 1000 : 10}
            onClick={() => {
              setClinicInfoOpen(false);
              onSelectPlace(place);
            }}
          >
            <Pin
              background={isSelected ? '#0284c7' : '#d97706'}
              borderColor={isSelected ? '#0369a1' : '#b45309'}
              glyphColor="#ffffff"
            />
          </AdvancedMarker>
        );
      })}

      {selectedPlace && (
        <InfoWindow
          position={selectedPlace.location}
          onCloseClick={() => onSelectPlace(null)}
        >
          <div className="max-w-xs space-y-1.5 p-1 text-slate-900">
            <p className="text-xs font-semibold">{selectedPlace.name}</p>
            <p className="text-[11px] text-slate-600">{selectedPlace.address}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {selectedPlace.googleMapsURI && (
                <a
                  href={selectedPlace.googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 underline"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {firebaseUser?.emailVerified ? (
                <button
                  type="button"
                  onClick={() =>
                    void onSavePlace({
                      placeId: selectedPlace.id,
                      title: selectedPlace.name,
                      mapsUri:
                        selectedPlace.googleMapsURI ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlace.name)}`,
                    })
                  }
                  className="text-[11px] font-medium text-sky-700 underline"
                >
                  {savedPlaceIds.has(selectedPlace.id) ? 'Saved' : 'Save bookmark'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-[11px] font-medium text-slate-600 underline"
                >
                  Sign in to save
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

export function ClinicLocatorView({
  clinic,
  theme,
  firebaseUser,
  savedPlaces,
  onOpenAuth,
}: ClinicLocatorViewProps) {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';
  const [mapsApiKey, setMapsApiKey] = useState<string>(envKey);
  const [loadingConfig, setLoadingConfig] = useState(!envKey);
  const [mapLoadError, setMapLoadError] = useState(false);

  const [center, setCenter] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const [placeQuery, setPlaceQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState<{ query: string; nonce: number } | null>(null);
  const [nearbyTrigger, setNearbyTrigger] = useState(0);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<DiscoveredPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<DiscoveredPlace | null>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);

  // Gemini Maps Grounding state
  const [groundingQuery, setGroundingQuery] = useState('');
  const [groundingBusy, setGroundingBusy] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingResult, setGroundingResult] = useState<MapsGroundingResponse | null>(null);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (envKey) {
      setMapsApiKey(envKey);
      setLoadingConfig(false);
      return;
    }
    let cancelled = false;
    api
      .getMapsConfig()
      .then((cfg) => {
        if (!cancelled) {
          setMapsApiKey(cfg.apiKeyConfigured ? cfg.apiKey : '');
        }
      })
      .catch(() => {
        if (!cancelled) setMapsApiKey('');
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envKey]);

  const savedPlaceIds = new Set(savedPlaces.map((p) => p.placeId));

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoStatus('Browser geolocation is unavailable.');
      return;
    }
    setGeoStatus('Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoStatus('Map centered on your current area.');
      },
      () => {
        setGeoStatus('Location permission declined; keeping clinic reference area.');
      },
      { timeout: 8000 }
    );
  }

  function handlePlacesSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) return;
    setSearchTrigger((prev) => ({
      query: placeQuery.trim(),
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }

  async function runGroundingSearch(queryText: string) {
    const trimmed = queryText.trim();
    if (!trimmed || groundingBusy) return;

    setGroundingBusy(true);
    setGroundingError(null);
    try {
      const res = await api.queryMapsGrounding({
        query: trimmed,
        lat: center.lat,
        lng: center.lng,
      });
      setGroundingResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to query Google Maps grounding.';
      if (isQuotaExceededMessage(msg)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setGroundingError(msg);
    } finally {
      setGroundingBusy(false);
    }
  }

  function handleGroundingSubmit(e: FormEvent) {
    e.preventDefault();
    void runGroundingSearch(groundingQuery);
  }

  async function handleSaveBookmark(place: {
    placeId: string;
    title: string;
    mapsUri: string;
  }) {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      onOpenAuth();
      return;
    }
    setSavingPlaceId(place.placeId);
    try {
      await savePlaceToFirestore(firebaseUser.uid, {
        placeId: place.placeId,
        title: place.title,
        mapsUri: place.mapsUri,
        category: inferPlaceCategory(place.title),
      });
    } finally {
      setSavingPlaceId(null);
    }
  }

  async function handleSaveGroundedPlace(place: GroundedPlaceLink) {
    await handleSaveBookmark({
      placeId: place.placeId || place.title.replace(/[^a-zA-Z0-9_-]/g, '_'),
      title: place.title,
      mapsUri: place.uri,
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Map + Places API (New) Section */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Clinic &amp; Pharmacy Locator
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Search nearby pharmacies, clinics, and pickup points using Google Maps Platform Places (New).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Crosshair className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>Use my location</span>
            </button>
            <button
              type="button"
              disabled={!mapsApiKey}
              onClick={() => setNearbyTrigger((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Find nearby pharmacies</span>
            </button>
          </div>
        </div>

        {geoStatus && (
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">{geoStatus}</p>
        )}

        <form onSubmit={handlePlacesSearchSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="maps-place-search" className="sr-only">
            Search pharmacies or clinics on the map
          </label>
          <input
            id="maps-place-search"
            type="text"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            placeholder="Search map (e.g., pharmacy, community clinic, diagnostic lab)..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!mapsApiKey || !placeQuery.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Search map</span>
          </button>
        </form>

        {placesError && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/50 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200"
          >
            {placesError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div
              data-testid="clinic-google-map-container"
              className="h-[440px] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
            >
              {loadingConfig ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  Loading Google Maps Platform...
                </div>
              ) : !mapsApiKey || mapLoadError ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <MapPin className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    Interactive map unavailable
                  </p>
                  <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                    Ensure Google Maps Platform is enabled in your project configuration or check the quota notice above.
                  </p>
                </div>
              ) : (
                <APIProvider apiKey={mapsApiKey} language="en" region="US">
                  <MapsStatusWatcher onAuthFailure={() => setMapLoadError(true)} />
                  <InnerMapContent
                    center={center}
                    clinic={clinic}
                    places={discoveredPlaces}
                    selectedPlace={selectedPlace}
                    onSelectPlace={setSelectedPlace}
                    onSearchResults={setDiscoveredPlaces}
                    onPlacesError={setPlacesError}
                    searchTrigger={searchTrigger}
                    nearbyTrigger={nearbyTrigger}
                    theme={theme}
                    firebaseUser={firebaseUser}
                    savedPlaceIds={savedPlaceIds}
                    onSavePlace={handleSaveBookmark}
                    onOpenAuth={onOpenAuth}
                  />
                </APIProvider>
              )}
            </div>
          </div>

          {/* Right column: Map search results */}
          <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 lg:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Map locations ({discoveredPlaces.length})
            </h3>
            {discoveredPlaces.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Click &ldquo;Find nearby pharmacies&rdquo; or run a map search to list verified locations from Google Maps.
              </p>
            ) : (
              <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {discoveredPlaces.map((place) => {
                  const isSaved = savedPlaceIds.has(place.id);
                  return (
                    <div
                      key={place.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        selectedPlace?.id === place.id
                          ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/50'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPlace(place)}
                        className="w-full text-left"
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {place.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {place.address}
                        </p>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {place.googleMapsURI ? (
                          <a
                            href={place.googleMapsURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            <span>Directions</span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          disabled={savingPlaceId === place.id}
                          onClick={() =>
                            void handleSaveBookmark({
                              placeId: place.id,
                              title: place.name,
                              mapsUri:
                                place.googleMapsURI ||
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400"
                        >
                          {isSaved ? (
                            <>
                              <BookmarkCheck className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="h-3.5 w-3.5" />
                              <span>{firebaseUser ? 'Save' : 'Sign in to save'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Grid: Gemini Maps Grounding + Firestore Saved Locations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Maps-Grounded Location Assistant
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Ask about nearby pharmacies, clinics, or hours using live Google Maps grounding.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_GROUNDING_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={groundingBusy}
                onClick={() => {
                  setGroundingQuery(prompt);
                  void runGroundingSearch(prompt);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={handleGroundingSubmit} className="mt-3 flex gap-2">
            <label htmlFor="grounding-search-input" className="sr-only">
              Ask Google Maps Grounding Assistant
            </label>
            <input
              id="grounding-search-input"
              type="text"
              value={groundingQuery}
              onChange={(e) => setGroundingQuery(e.target.value)}
              placeholder="e.g., Which pharmacies near me are open late?"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={groundingBusy || !groundingQuery.trim()}
              className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              {groundingBusy ? 'Searching...' : 'Ask Maps AI'}
            </button>
          </form>

          {groundingError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              {groundingError}
            </div>
          )}

          {groundingResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-4 space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4"
            >
              <div className="space-y-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
                {groundingResult.answerText}
              </div>

              {groundingResult.places.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Grounded Google Maps Sources
                  </p>
                  <ul className="mt-2 space-y-2.5">
                    {groundingResult.places.map((place) => (
                      <li
                        key={place.uri}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <a
                            href={place.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            <span>{place.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>

                          <button
                            type="button"
                            onClick={() => void handleSaveGroundedPlace(place)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400"
                          >
                            <Bookmark className="h-3 w-3" aria-hidden="true" />
                            <span>{firebaseUser ? 'Save place' : 'Sign in to save'}</span>
                          </button>
                        </div>

                        {place.reviewSnippets.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                            {place.reviewSnippets.map((snippet, idx) => (
                              <p
                                key={`${place.uri}-snip-${idx}`}
                                className="text-[11px] italic text-slate-600 dark:text-slate-400"
                              >
                                &ldquo;{snippet.text}&rdquo;
                                {snippet.author ? ` — ${snippet.author}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </section>

        {/* Right column: Firestore-persisted Saved Places */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Saved Pharmacies &amp; Clinics
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Synced privately to your Cloud workspace when signed in with Google.
              </p>
            </div>
          </div>

          {!firebaseUser ? (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Sign in with your Google account to save nearby clinics and pharmacies to your synced workspace.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="mt-3 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800"
              >
                Continue with Google
              </button>
            </div>
          ) : savedPlaces.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5 text-center text-xs text-slate-500 dark:text-slate-400">
              No saved places yet. Save any location from the map or Grounded Assistant.
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {savedPlaces.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3"
                >
                  <div className="min-w-0">
                    <a
                      href={item.mapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      <span className="truncate">{item.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.category.replace('_', ' ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSavedPlaceFromFirestore(firebaseUser.uid, item.id)}
                    aria-label={`Remove saved place ${item.title}`}
                    className="rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 dark:text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
