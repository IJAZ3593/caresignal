import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMapsGroundingPlaces,
  inferPlaceCategory,
  isQuotaExceededMessage,
} from './mapsHelpers';

test('extractMapsGroundingPlaces extracts deduplicated HTTPS map links and review snippets', () => {
  const rawChunks = [
    {
      maps: {
        uri: 'https://maps.google.com/?cid=101',
        title: 'Oakridge 24h Pharmacy',
        placeId: 'places/ChIJ123',
        placeAnswerSources: {
          reviewSnippets: [
            { content: 'Fast prescription pickup and friendly staff.', author: 'Alex M.' },
            { content: '' },
          ],
        },
      },
    },
    {
      maps: {
        uri: 'https://maps.google.com/?cid=101', // duplicate URI
        title: 'Duplicate Entry',
      },
    },
    {
      maps: {
        uri: 'http://insecure.example.com', // non-HTTPS rejected
        title: 'Insecure Link',
      },
    },
    {
      web: { uri: 'https://example.com', title: 'Non-maps chunk' },
    },
  ];

  const places = extractMapsGroundingPlaces(rawChunks);
  assert.equal(places.length, 1);
  assert.equal(places[0].title, 'Oakridge 24h Pharmacy');
  assert.equal(places[0].placeId, 'places/ChIJ123');
  assert.equal(places[0].reviewSnippets.length, 1);
  assert.equal(places[0].reviewSnippets[0].author, 'Alex M.');
});

test('inferPlaceCategory classifies pharmacy, urgent care, clinic, and fallback', () => {
  assert.equal(inferPlaceCategory('CVS Pharmacy'), 'pharmacy');
  assert.equal(inferPlaceCategory('Metro Urgent Care'), 'urgent_care');
  assert.equal(inferPlaceCategory('Oakridge Community Clinic'), 'clinic');
  assert.equal(inferPlaceCategory('Downtown Plaza'), 'other');
});

test('isQuotaExceededMessage identifies known GMP quota errors only', () => {
  assert.equal(isQuotaExceededMessage('Google Maps API error: OverQuotaMapError'), true);
  assert.equal(isQuotaExceededMessage('RESOURCE_EXHAUSTED'), true);
  assert.equal(isQuotaExceededMessage('No results found for query'), false);
});
