// k6 load + correctness test for GrabMaps APIs
// Run: k6 run -e API_KEY=xxx -e BASE=https://maps.grab.com stress/k6_load.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'https://maps.grab.com';
const KEY  = __ENV.API_KEY || '';

const server500s  = new Rate('server_500s');
const stackLeaks  = new Rate('stack_trace_leaks');

export let options = {
  stages: [
    { duration: '20s', target: 10  },
    { duration: '40s', target: 50  },
    { duration: '20s', target: 200 },
    { duration: '20s', target: 500 },
    { duration: '20s', target: 0   },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

function headers() {
  return KEY ? { 'Authorization': `Bearer ${KEY}` } : {};
}

function checkResp(res, tag) {
  const is5xx = res.status >= 500;
  const hasStack = res.body && (
    (res.body.includes('at ') && res.body.includes('.java:')) ||
    res.body.includes('Traceback') ||
    res.body.includes('Exception') ||
    res.body.includes('panic:')
  );

  server500s.add(is5xx);
  stackLeaks.add(!!hasStack);

  if (is5xx)    console.log(`[500] ${tag} | ${res.url} | ${res.body.substring(0, 200)}`);
  if (hasStack) console.log(`[STACK] ${tag} | ${res.url} | ${res.body.substring(0, 300)}`);

  check(res, {
    [`${tag}: no 5xx`]:         (r) => r.status < 500,
    [`${tag}: no stack trace`]: (r) => !hasStack,
    [`${tag}: valid JSON`]:     (r) => {
      try { JSON.parse(r.body); return true; } catch(e) { return r.status >= 400; }
    },
  });
}

const GEOCODE_INPUTS = [
  'Singapore', '0,0', '', ' ', '<script>alert(1)</script>',
  "' OR 1=1--", '新加坡', '%00', 'null', '../../etc/passwd',
  'A'.repeat(500),
];

const COORD_CASES = [
  '1.3521,103.8198', '0,0', '90,180', '-90,-180',
  '91,0', '0,181', 'NaN,NaN', 'Infinity,0', ',',
];

export default function () {
  const h = headers();

  group('geocoding', () => {
    const q = GEOCODE_INPUTS[Math.floor(Math.random() * GEOCODE_INPUTS.length)];
    checkResp(http.get(`${BASE}/geocode?q=${encodeURIComponent(q)}`, { headers: h }), `geocode`);
  });

  group('reverse_geocode', () => {
    const coords = COORD_CASES[Math.floor(Math.random() * COORD_CASES.length)].split(',');
    checkResp(
      http.get(`${BASE}/geocode/reverse?lat=${coords[0]}&lng=${coords[1]}`, { headers: h }),
      `reverse`
    );
  });

  group('routing', () => {
    const cases = [
      'from=1.3521,103.8198&to=1.2800,103.8501',
      'from=1.3521,103.8198&to=1.3521,103.8198',  // circular
      'from=NaN,NaN&to=0,0',
      'from=91,0&to=0,0',
      'from=1.3,103.8&to=-1.3,-76.2',              // antipodal
      'to=1.3521,103.8198',                         // missing from
    ];
    const q = cases[Math.floor(Math.random() * cases.length)];
    checkResp(http.get(`${BASE}/route?${q}`, { headers: h }), `route`);
  });

  group('places', () => {
    const cases = [
      'q=food&lat=1.3521&lng=103.8198',
      'bbox=-90,-180,90,180',
      'bbox=90,180,-90,-180',
      'q=&lat=1.3521&lng=103.8198',
      'q=food&lat=1.3521&lng=103.8198&radius=999999999',
    ];
    const q = cases[Math.floor(Math.random() * cases.length)];
    checkResp(http.get(`${BASE}/places?${q}`, { headers: h }), `places`);
  });

  sleep(0.05);
}
