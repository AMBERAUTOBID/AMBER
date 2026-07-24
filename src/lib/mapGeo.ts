/**
 * Geographic data backing the cost-calculator route map: the 6 US loading
 * ports, the 3 destination ports, approximate coordinates for every Copart/
 * IAAI pickup branch in PICKUP_LOCATIONS, and stylized-but-geographically-
 * sane multi-waypoint ocean routes (Panama Canal, Florida Straits, St.
 * Lawrence Seaway, Gibraltar/Mediterranean/Black Sea) between them.
 *
 * Coordinates are city-level approximations for map placement only — not
 * exact branch addresses or routing-grade waypoints.
 */

export type GeoPoint = { lat: number; lng: number };

export type LoadingPort = {
  name: string;
  city: string;
  point: GeoPoint;
};

export type DestinationPort = {
  name: string;
  point: GeoPoint;
};

export const LOADING_PORTS: LoadingPort[] = [
  { name: "Los Angeles, CA", city: "Los Angeles", point: { lat: 33.73, lng: -118.26 } },
  { name: "Seattle, WA", city: "Seattle", point: { lat: 47.58, lng: -122.34 } },
  { name: "Newark, NJ", city: "Newark", point: { lat: 40.68, lng: -74.15 } },
  { name: "Houston, TX", city: "Houston", point: { lat: 29.68, lng: -95.15 } },
  { name: "Savannah, GA", city: "Savannah", point: { lat: 32.08, lng: -81.09 } },
  { name: "Chicago, IL", city: "Chicago", point: { lat: 41.88, lng: -87.63 } },
];

// Keys match the PORT_MULTIPLIER keys used in CostCalculator.tsx.
export const DESTINATION_PORTS: Record<string, DestinationPort> = {
  "Klaipėda, Lithuania": { name: "Klaipėda, Lithuania", point: { lat: 55.7, lng: 21.14 } },
  "Poti, Georgia": { name: "Poti, Georgia", point: { lat: 42.15, lng: 41.67 } },
  "Rotterdam, Netherlands": { name: "Rotterdam, Netherlands", point: { lat: 51.92, lng: 4.48 } },

  // Additional destination ports shown on the globe and selectable in the
  // calculator, but without real customs/duty data — these route through
  // CostCalculator's quote-only flow (email request) instead of a numeric
  // estimate. See QUOTE_ONLY_DESTINATION_PORTS below.
  "Bremerhaven, Germany": { name: "Bremerhaven, Germany", point: { lat: 53.55, lng: 8.58 } },
  "Gdańsk, Poland": { name: "Gdańsk, Poland", point: { lat: 54.35, lng: 18.65 } },
  "Batumi, Georgia": { name: "Batumi, Georgia", point: { lat: 41.65, lng: 41.64 } },
  "Constanța, Romania": { name: "Constanța, Romania", point: { lat: 44.18, lng: 28.65 } },
  "Varna, Bulgaria": { name: "Varna, Bulgaria", point: { lat: 43.21, lng: 27.92 } },
  "Mersin, Turkey": { name: "Mersin, Turkey", point: { lat: 36.8, lng: 34.64 } },
  "Beirut, Lebanon": { name: "Beirut, Lebanon", point: { lat: 33.89, lng: 35.5 } },
  "Aqaba, Jordan": { name: "Aqaba, Jordan", point: { lat: 29.53, lng: 35.0 } },
  "Dubai, United Arab Emirates": { name: "Dubai, United Arab Emirates", point: { lat: 24.98, lng: 54.98 } },
  "Dammam, Saudi Arabia": { name: "Dammam, Saudi Arabia", point: { lat: 26.43, lng: 50.1 } },
  "Doha, Qatar": { name: "Doha, Qatar", point: { lat: 25.29, lng: 51.53 } },
  "Salalah, Oman": { name: "Salalah, Oman", point: { lat: 17.02, lng: 54.09 } },
};

export const QUOTE_ONLY_DESTINATION_PORTS: string[] = [
  "Bremerhaven, Germany",
  "Gdańsk, Poland",
  "Batumi, Georgia",
  "Constanța, Romania",
  "Varna, Bulgaria",
  "Mersin, Turkey",
  "Beirut, Lebanon",
  "Aqaba, Jordan",
  "Dubai, United Arab Emirates",
  "Dammam, Saudi Arabia",
  "Doha, Qatar",
  "Salalah, Oman",
];

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestLoadingPort(pickup: GeoPoint): LoadingPort {
  let best = LOADING_PORTS[0];
  let bestDist = Infinity;
  for (const port of LOADING_PORTS) {
    const d = haversineKm(pickup, port.point);
    if (d < bestDist) {
      bestDist = d;
      best = port;
    }
  }
  return best;
}

/**
 * Base city coordinates, keyed by the exact "City, ST" string as it should
 * be looked up (see CITY_OVERRIDES below for branch-name normalization).
 * City-level precision — adequate for a small illustrative map marker.
 */
const BASE_CITY_COORDS: Record<string, GeoPoint> = {
  "Tanner, AL": { lat: 34.61, lng: -86.85 },
  "Birmingham, AL": { lat: 33.52, lng: -86.81 },
  "Montgomery, AL": { lat: 32.37, lng: -86.3 },
  "Mobile, AL": { lat: 30.69, lng: -88.04 },
  "Dothan, AL": { lat: 31.22, lng: -85.39 },
  "Anchorage, AK": { lat: 61.22, lng: -149.9 },
  "Phoenix, AZ": { lat: 33.45, lng: -112.07 },
  "Tucson, AZ": { lat: 32.22, lng: -110.93 },
  "Little Rock, AR": { lat: 34.75, lng: -92.29 },
  "Fayetteville, AR": { lat: 36.06, lng: -94.16 },
  "Vallejo, CA": { lat: 38.1, lng: -122.26 },
  "Sacramento, CA": { lat: 38.58, lng: -121.49 },
  "Hayward, CA": { lat: 37.67, lng: -122.08 },
  "Fresno, CA": { lat: 36.75, lng: -119.77 },
  "Bakersfield, CA": { lat: 35.37, lng: -119.02 },
  "San Jose, CA": { lat: 37.34, lng: -121.89 },
  "San Bernardino, CA": { lat: 34.11, lng: -117.29 },
  "Los Angeles, CA": { lat: 34.05, lng: -118.24 },
  "Van Nuys, CA": { lat: 34.19, lng: -118.45 },
  "San Diego, CA": { lat: 32.72, lng: -117.16 },
  "Martinez, CA": { lat: 38.02, lng: -122.13 },
  "Rancho Cucamonga, CA": { lat: 34.11, lng: -117.59 },
  "Sun Valley, CA": { lat: 34.22, lng: -118.37 },
  "Anaheim, CA": { lat: 33.84, lng: -117.91 },
  "Carson, CA": { lat: 33.83, lng: -118.28 },
  "Perris, CA": { lat: 33.78, lng: -117.23 },
  "Oakland, CA": { lat: 37.8, lng: -122.27 },
  "Denver, CO": { lat: 39.74, lng: -104.99 },
  "Colorado Springs, CO": { lat: 38.83, lng: -104.82 },
  "Hartford, CT": { lat: 41.76, lng: -72.69 },
  "Seaford, DE": { lat: 38.64, lng: -75.61 },
  "Washington, DC": { lat: 38.9, lng: -77.04 },
  "Miami, FL": { lat: 25.76, lng: -80.19 },
  "Tampa, FL": { lat: 27.95, lng: -82.46 },
  "Jacksonville, FL": { lat: 30.33, lng: -81.66 },
  "Orlando, FL": { lat: 28.54, lng: -81.38 },
  "West Palm Beach, FL": { lat: 26.72, lng: -80.05 },
  "Fort Pierce, FL": { lat: 27.45, lng: -80.33 },
  "Ocala, FL": { lat: 29.19, lng: -82.14 },
  "Tallahassee, FL": { lat: 30.44, lng: -84.28 },
  "Punta Gorda, FL": { lat: 26.93, lng: -82.05 },
  "Clearwater, FL": { lat: 27.97, lng: -82.8 },
  "Atlanta, GA": { lat: 33.75, lng: -84.39 },
  "Savannah, GA": { lat: 32.08, lng: -81.09 },
  "Tifton, GA": { lat: 31.45, lng: -83.51 },
  "Cartersville, GA": { lat: 34.16, lng: -84.8 },
  "Honolulu, HI": { lat: 21.31, lng: -157.86 },
  "Boise, ID": { lat: 43.62, lng: -116.2 },
  "Chicago, IL": { lat: 41.88, lng: -87.63 },
  "Peoria, IL": { lat: 40.69, lng: -89.59 },
  "Wheeling, IL": { lat: 42.14, lng: -87.93 },
  "Indianapolis, IN": { lat: 39.77, lng: -86.16 },
  "Fort Wayne, IN": { lat: 41.08, lng: -85.14 },
  "Hammond, IN": { lat: 41.58, lng: -87.5 },
  "Des Moines, IA": { lat: 41.59, lng: -93.62 },
  "Davenport, IA": { lat: 41.52, lng: -90.58 },
  "Kansas City, KS": { lat: 39.11, lng: -94.63 },
  "Wichita, KS": { lat: 37.69, lng: -97.34 },
  "Lexington, KY": { lat: 38.04, lng: -84.5 },
  "Walton, KY": { lat: 38.87, lng: -84.61 },
  "Louisville, KY": { lat: 38.25, lng: -85.76 },
  "Ashland, KY": { lat: 38.48, lng: -82.64 },
  "Bowling Green, KY": { lat: 36.99, lng: -86.44 },
  "Baton Rouge, LA": { lat: 30.45, lng: -91.19 },
  "New Orleans, LA": { lat: 29.95, lng: -90.07 },
  "Shreveport, LA": { lat: 32.52, lng: -93.75 },
  "Lyman, ME": { lat: 43.49, lng: -70.6 },
  "Baltimore, MD": { lat: 39.29, lng: -76.61 },
  "Dundalk, MD": { lat: 39.25, lng: -76.52 },
  "Elkton, MD": { lat: 39.61, lng: -75.83 },
  "Boston, MA": { lat: 42.36, lng: -71.06 },
  "Shirley, MA": { lat: 42.55, lng: -71.65 },
  "Warren, MA": { lat: 42.21, lng: -72.2 },
  "Detroit, MI": { lat: 42.33, lng: -83.05 },
  "Lansing, MI": { lat: 42.73, lng: -84.56 },
  "Kincheloe, MI": { lat: 46.27, lng: -84.47 },
  "Flint, MI": { lat: 43.01, lng: -83.69 },
  "Ionia, MI": { lat: 42.99, lng: -85.07 },
  "Minneapolis, MN": { lat: 44.98, lng: -93.27 },
  "Saint Cloud, MN": { lat: 45.56, lng: -94.16 },
  "Jackson, MS": { lat: 32.3, lng: -90.18 },
  "Saint Louis, MO": { lat: 38.63, lng: -90.2 },
  "Springfield, MO": { lat: 37.21, lng: -93.29 },
  "Columbia, MO": { lat: 38.95, lng: -92.33 },
  "Sikeston, MO": { lat: 36.88, lng: -89.59 },
  "Helena, MT": { lat: 46.59, lng: -112.04 },
  "Billings, MT": { lat: 45.78, lng: -108.5 },
  "Lincoln, NE": { lat: 40.81, lng: -96.68 },
  "Las Vegas, NV": { lat: 36.17, lng: -115.14 },
  "Reno, NV": { lat: 39.53, lng: -119.81 },
  "Candia, NH": { lat: 43.06, lng: -71.28 },
  "Glassboro, NJ": { lat: 39.7, lng: -75.11 },
  "Somerville, NJ": { lat: 40.57, lng: -74.61 },
  "Trenton, NJ": { lat: 40.22, lng: -74.76 },
  "Avenel, NJ": { lat: 40.58, lng: -74.29 },
  "Newark, NJ": { lat: 40.74, lng: -74.17 },
  "New Brunswick, NJ": { lat: 40.49, lng: -74.45 },
  "Albuquerque, NM": { lat: 35.08, lng: -106.65 },
  "Newburgh, NY": { lat: 41.5, lng: -74.01 },
  "Syracuse, NY": { lat: 43.05, lng: -76.15 },
  "Islip, NY": { lat: 40.73, lng: -73.21 },
  "Rochester, NY": { lat: 43.16, lng: -77.61 },
  "Albany, NY": { lat: 42.65, lng: -73.75 },
  "Buffalo, NY": { lat: 42.89, lng: -78.88 },
  "China Grove, NC": { lat: 35.57, lng: -80.58 },
  "Raleigh, NC": { lat: 35.78, lng: -78.64 },
  "Mebane, NC": { lat: 36.1, lng: -79.27 },
  "Asheville, NC": { lat: 35.6, lng: -82.55 },
  "Charlotte, NC": { lat: 35.23, lng: -80.84 },
  "Concord, NC": { lat: 35.41, lng: -80.58 },
  "Columbus, OH": { lat: 39.96, lng: -83.0 },
  "Cleveland, OH": { lat: 41.5, lng: -81.69 },
  "Dayton, OH": { lat: 39.76, lng: -84.19 },
  "Akron, OH": { lat: 41.08, lng: -81.52 },
  "Cincinnati, OH": { lat: 39.1, lng: -84.51 },
  "Oklahoma City, OK": { lat: 35.47, lng: -97.52 },
  "Tulsa, OK": { lat: 36.15, lng: -95.99 },
  "Portland, OR": { lat: 45.52, lng: -122.68 },
  "Eugene, OR": { lat: 44.05, lng: -123.09 },
  "Philadelphia, PA": { lat: 39.95, lng: -75.16 },
  "Pittsburgh, PA": { lat: 40.44, lng: -79.99 },
  "Harrisburg, PA": { lat: 40.27, lng: -76.88 },
  "York, PA": { lat: 40.11, lng: -76.73 },
  "Chambersburg, PA": { lat: 39.94, lng: -77.66 },
  "Altoona, PA": { lat: 40.52, lng: -78.4 },
  "Scranton, PA": { lat: 41.41, lng: -75.66 },
  "Bridgeport, PA": { lat: 40.13, lng: -75.34 },
  "Columbia, SC": { lat: 34.0, lng: -81.03 },
  "Greer, SC": { lat: 34.94, lng: -82.23 },
  "Charleston, SC": { lat: 32.78, lng: -79.93 },
  "Memphis, TN": { lat: 35.15, lng: -90.05 },
  "Nashville, TN": { lat: 36.16, lng: -86.78 },
  "Knoxville, TN": { lat: 35.96, lng: -83.92 },
  "Chattanooga, TN": { lat: 35.05, lng: -85.31 },
  "Houston, TX": { lat: 29.76, lng: -95.37 },
  "Dallas, TX": { lat: 32.78, lng: -96.8 },
  "Dallas/Fort Worth, TX": { lat: 32.9, lng: -97.04 },
  "Fort Worth, TX": { lat: 32.75, lng: -97.33 },
  "Lufkin, TX": { lat: 31.34, lng: -94.73 },
  "Longview, TX": { lat: 32.5, lng: -94.74 },
  "El Paso, TX": { lat: 31.76, lng: -106.49 },
  "Austin, TX": { lat: 30.27, lng: -97.74 },
  "McAllen, TX": { lat: 26.2, lng: -98.23 },
  "Abilene, TX": { lat: 32.45, lng: -99.73 },
  "San Antonio, TX": { lat: 29.42, lng: -98.49 },
  "Amarillo, TX": { lat: 35.2, lng: -101.83 },
  "Corpus Christi, TX": { lat: 27.8, lng: -97.4 },
  "Waco, TX": { lat: 31.55, lng: -97.15 },
  "Salt Lake City, UT": { lat: 40.76, lng: -111.89 },
  "Burlington, VT": { lat: 44.48, lng: -73.21 },
  "Danville, VA": { lat: 36.59, lng: -79.4 },
  "Hampton, VA": { lat: 37.03, lng: -76.35 },
  "Richmond, VA": { lat: 37.54, lng: -77.44 },
  "Culpeper, VA": { lat: 38.47, lng: -77.99 },
  "Seattle, WA": { lat: 47.61, lng: -122.33 },
  "Graham, WA": { lat: 47.06, lng: -122.29 },
  "Pasco, WA": { lat: 46.24, lng: -119.1 },
  "Spokane, WA": { lat: 47.66, lng: -117.43 },
  "Charleston, WV": { lat: 38.35, lng: -81.63 },
  "Buckhannon, WV": { lat: 38.99, lng: -80.23 },
  "Madison, WI": { lat: 43.07, lng: -89.4 },
  "Milwaukee, WI": { lat: 43.04, lng: -87.91 },
  "Appleton, WI": { lat: 44.26, lng: -88.41 },
  "Casper, WY": { lat: 42.85, lng: -106.31 },

  // Added with the 2026 local-transportation rate table — see
  // localTransportRates.ts. City-level approximations; several are
  // Copart/IAAI sublot or regional-network names rather than distinct towns
  // (e.g. "CrashedToys X", "IAA CAT Houston", "Metro DC"), placed at their
  // nearest real city/region for map purposes.
  "Adelanto, CA": { lat: 34.58, lng: -117.41 },
  "Andrews, TX": { lat: 32.32, lng: -102.55 },
  "Antelope, CA": { lat: 38.71, lng: -121.36 },
  "Augusta, GA": { lat: 33.47, lng: -81.97 },
  "Baltimore East, MD": { lat: 39.29, lng: -76.5 },
  "Bartlett, IL": { lat: 41.98, lng: -88.19 },
  "Bismarck, ND": { lat: 46.81, lng: -100.78 },
  "Cincinnati South, OH": { lat: 39.02, lng: -84.5 },
  "Colton, CA": { lat: 34.07, lng: -117.31 },
  "CrashedToys East Bethel, MN": { lat: 45.33, lng: -93.2 },
  "CrashedToys Eldridge, IA": { lat: 41.65, lng: -90.58 },
  "CrashedToys Minneapolis, MN": { lat: 44.98, lng: -93.27 },
  "CrashedToys Sacramento, CA": { lat: 38.58, lng: -121.49 },
  "Denver Central, CO": { lat: 39.74, lng: -104.99 },
  "Dyer, IN": { lat: 41.5, lng: -87.52 },
  "Earlington, KY": { lat: 37.27, lng: -87.51 },
  "Englishtown, NJ": { lat: 40.29, lng: -74.36 },
  "Erie, PA": { lat: 42.13, lng: -80.09 },
  "Exeter, RI": { lat: 41.56, lng: -71.58 },
  "Fargo, ND": { lat: 46.88, lng: -96.79 },
  "Fontana, CA": { lat: 34.09, lng: -117.44 },
  "Fort Myers, FL": { lat: 26.64, lng: -81.87 },
  "Fort Worth North, TX": { lat: 32.78, lng: -97.33 },
  "Fredericksburg South, VA": { lat: 38.3, lng: -77.46 },
  "Fredericksburg, VA": { lat: 38.3, lng: -77.46 },
  "Freetown, MA": { lat: 41.77, lng: -71.03 },
  "Fremont, CA": { lat: 37.55, lng: -121.99 },
  "Glassboro East, NJ": { lat: 39.7, lng: -75.11 },
  "Glassboro West, NJ": { lat: 39.7, lng: -75.11 },
  "Grand Rapids, MI": { lat: 42.96, lng: -85.67 },
  "Greensboro, NC": { lat: 36.07, lng: -79.79 },
  "Greenville, SC": { lat: 34.85, lng: -82.4 },
  "Grenada, MS": { lat: 33.78, lng: -89.81 },
  "Gulf Coast, MS": { lat: 30.39, lng: -89.09 },
  "Hartford City, IN": { lat: 40.45, lng: -85.37 },
  "Hartford South, CT": { lat: 41.76, lng: -72.69 },
  "Hartford Springfield, CT": { lat: 41.85, lng: -72.65 },
  "High Desert, CA": { lat: 34.58, lng: -117.3 },
  "Houston East, TX": { lat: 29.75, lng: -95.2 },
  "Houston North, TX": { lat: 29.9, lng: -95.4 },
  "Houston South, TX": { lat: 29.6, lng: -95.35 },
  "Huntsville, AL": { lat: 34.73, lng: -86.59 },
  "IAA CAT Houston, TX": { lat: 29.76, lng: -95.37 },
  "Indianapolis South, IN": { lat: 39.77, lng: -86.16 },
  "Jacksonville North, FL": { lat: 30.33, lng: -81.66 },
  "Kansas City East, MO": { lat: 39.1, lng: -94.4 },
  "Lafayette, LA": { lat: 30.22, lng: -92.02 },
  "Laurel, MD": { lat: 39.1, lng: -76.85 },
  "Lexington, SC": { lat: 33.98, lng: -81.24 },
  "Lincoln, IL": { lat: 40.15, lng: -89.37 },
  "Long Beach, CA": { lat: 33.77, lng: -118.19 },
  "Los Angeles South, CA": { lat: 33.9, lng: -118.2 },
  "Louisville North, KY": { lat: 38.25, lng: -85.76 },
  "Lubbock, TX": { lat: 33.58, lng: -101.86 },
  "Macon, GA": { lat: 32.84, lng: -83.63 },
  "Madison South, WI": { lat: 43.07, lng: -89.4 },
  "Manchester, NH": { lat: 42.99, lng: -71.46 },
  "Mentone, CA": { lat: 34.07, lng: -117.14 },
  "Metro DC, MD": { lat: 38.9, lng: -77.04 },
  "Milwaukee North, WI": { lat: 43.04, lng: -87.91 },
  "Milwaukee South, WI": { lat: 43.04, lng: -87.91 },
  "Minneapolis South, MN": { lat: 44.98, lng: -93.27 },
  "Minneapolis/St. Paul, MN": { lat: 44.95, lng: -93.09 },
  "Missoula, MT": { lat: 46.87, lng: -114.01 },
  "Mobile South, AL": { lat: 30.69, lng: -88.04 },
  "Mocksville, NC": { lat: 35.9, lng: -80.58 },
  "Napa, CA": { lat: 38.3, lng: -122.29 },
  "New Castle, DE": { lat: 39.66, lng: -75.57 },
  "New Orleans East, LA": { lat: 30.03, lng: -89.93 },
  "North Charleston, SC": { lat: 32.89, lng: -80.01 },
  "North Hollywood, CA": { lat: 34.17, lng: -118.38 },
  "Northern New Jersey, NJ": { lat: 40.85, lng: -74.15 },
  "Northern Virginia, VA": { lat: 38.85, lng: -77.3 },
  "Ogden, UT": { lat: 41.22, lng: -111.97 },
  "Omaha, NE": { lat: 41.26, lng: -95.94 },
  "Orlando South, FL": { lat: 28.54, lng: -81.38 },
  "Pensacola, FL": { lat: 30.42, lng: -87.22 },
  "Permian Basin, TX": { lat: 31.87, lng: -102.37 },
  "Perris 2, CA": { lat: 33.78, lng: -117.23 },
  "Pittsburgh West, PA": { lat: 40.44, lng: -79.99 },
  "Port Murray, NJ": { lat: 40.79, lng: -74.9 },
  "Portage, WI": { lat: 43.54, lng: -89.46 },
  "Portland (Gorham), ME": { lat: 43.68, lng: -70.44 },
  "Portland West, OR": { lat: 45.52, lng: -122.68 },
  "Providence, RI": { lat: 41.82, lng: -71.41 },
  "Pulaski, VA": { lat: 37.05, lng: -80.78 },
  "Punta Gorda South, FL": { lat: 26.93, lng: -82.05 },
  "Redding, CA": { lat: 40.59, lng: -122.39 },
  "Richmond East, VA": { lat: 37.54, lng: -77.44 },
  "Roanoke, VA": { lat: 37.27, lng: -79.94 },
  "Rosedale, MD": { lat: 39.34, lng: -76.51 },
  "Salt Lake City North, UT": { lat: 40.76, lng: -111.89 },
  "San Antonio South, TX": { lat: 29.42, lng: -98.49 },
  "San Martin, CA": { lat: 37.09, lng: -121.61 },
  "Sayreville, NJ": { lat: 40.46, lng: -74.36 },
  "Shady Spring, WV": { lat: 37.72, lng: -81.08 },
  "Sioux Falls, SD": { lat: 43.55, lng: -96.7 },
  "South Bend, IN": { lat: 41.68, lng: -86.25 },
  "Southern Illinois, IL": { lat: 37.73, lng: -89.22 },
  "Southern New Jersey, NJ": { lat: 39.6, lng: -75.1 },
  "Spartanburg, SC": { lat: 34.95, lng: -81.93 },
  "Suffolk, VA": { lat: 36.73, lng: -76.58 },
  "Tampa North, FL": { lat: 27.95, lng: -82.46 },
  "Taunton, MA": { lat: 41.9, lng: -71.09 },
  "Templeton, MA": { lat: 42.57, lng: -72.06 },
  "Tidewater, VA": { lat: 36.85, lng: -76.29 },
  "Wayland, MI": { lat: 42.67, lng: -85.65 },
  "Webster, NH": { lat: 43.3, lng: -71.85 },
  "Wilmington, NC": { lat: 34.22, lng: -77.94 },
  "York Springs, PA": { lat: 40.0, lng: -77.14 },
};

/**
 * Maps a PICKUP_LOCATIONS branch label to its BASE_CITY_COORDS key, when the
 * branch name itself (directional suffix, parenthetical, or region name)
 * isn't a direct hit.
 */
const CITY_OVERRIDES: Record<string, string> = {
  "South Sacramento, CA": "Sacramento, CA",
  "East Bay, CA": "Oakland, CA",
  "Denver South, CO": "Denver, CO",
  "Denver East, CO": "Denver, CO",
  "Miami North, FL": "Miami, FL",
  "Miami Central, FL": "Miami, FL",
  "Miami South, FL": "Miami, FL",
  "Tampa South, FL": "Tampa, FL",
  "Jacksonville West, FL": "Jacksonville, FL",
  "Jacksonville East, FL": "Jacksonville, FL",
  "Orlando North, FL": "Orlando, FL",
  "Atlanta West, GA": "Atlanta, GA",
  "Atlanta East, GA": "Atlanta, GA",
  "Atlanta South, GA": "Atlanta, GA",
  "Atlanta North, GA": "Atlanta, GA",
  "Chicago North, IL": "Chicago, IL",
  "Chicago South, IL": "Chicago, IL",
  "Chicago West, IL": "Chicago, IL",
  "Lexington West, KY": "Lexington, KY",
  "Lexington East, KY": "Lexington, KY",
  "Minneapolis North, MN": "Minneapolis, MN",
  "Boston South, MA": "Boston, MA",
  "Boston North, MA": "Boston, MA",
  "West Warren, MA": "Warren, MA",
  "Boston (Shirley), MA": "Shirley, MA",
  "Cleveland East, OH": "Cleveland, OH",
  "Cleveland West, OH": "Cleveland, OH",
  "Akron-Canton, OH": "Akron, OH",
  "Portland North, OR": "Portland, OR",
  "Portland South, OR": "Portland, OR",
  "Philadelphia East, PA": "Philadelphia, PA",
  "Pittsburgh North, PA": "Pittsburgh, PA",
  "Pittsburgh South, PA": "Pittsburgh, PA",
  "Pittsburgh East, PA": "Pittsburgh, PA",
  "York Haven, PA": "York, PA",
  "Dallas South, TX": "Dallas, TX",
  "Austin North, TX": "Austin, TX",
  "North Seattle, WA": "Seattle, WA",
  "Central New Jersey, NJ": "New Brunswick, NJ",
  "Long Island, NY": "Islip, NY",
};

export function pickupCoords(location: string): GeoPoint | null {
  const key = CITY_OVERRIDES[location] ?? location;
  return BASE_CITY_COORDS[key] ?? null;
}

// --- Ocean route waypoints -------------------------------------------------
// Shared named waypoints marking real maritime chokepoints and coastal
// standoff points. Chosen so the GREAT-CIRCLE segment between consecutive
// waypoints stays over water (the globe renders each segment as a true
// great-circle arc, so a bad pair would visibly cut across land).
const WP = {
  // Pacific coastal corridor down to the canal
  offSanFrancisco: { lat: 36.8, lng: -124.6 },
  offBajaNorth: { lat: 28.4, lng: -116.6 },
  offCabo: { lat: 21.3, lng: -111.6 },
  offCentralAmerica: { lat: 10.6, lng: -87.6 },
  panamaPacific: { lat: 8.9, lng: -79.55 },
  panamaAtlantic: { lat: 9.5, lng: -79.9 },
  caribbeanExit: { lat: 19.6, lng: -67.3 },
  // Gulf of Mexico
  gulfMid: { lat: 25.6, lng: -86.8 },
  floridaStraits: { lat: 24.3, lng: -80.3 },
  // North Atlantic
  offGrandBanks: { lat: 44.2, lng: -49.0 },
  mackinac: { lat: 45.82, lng: -84.9 },
  stLawrenceExit: { lat: 48.9, lng: -64.0 },
  offAvalon: { lat: 46.2, lng: -51.8 },
  // Channel / North Sea / Baltic
  englishChannel: { lat: 49.8, lng: -3.0 },
  doverStrait: { lat: 51.05, lng: 1.45 },
  northSeaMid: { lat: 56.2, lng: 4.8 },
  skagerrak: { lat: 58.0, lng: 9.5 },
  kattegat: { lat: 56.7, lng: 11.6 },
  oresund: { lat: 55.6, lng: 12.8 },
  southBaltic: { lat: 55.2, lng: 15.9 },
  // Iberia / Mediterranean / Black Sea
  offPortugal: { lat: 36.9, lng: -9.9 },
  gibraltar: { lat: 35.95, lng: -5.7 },
  sicilyStrait: { lat: 37.4, lng: 11.2 },
  ionianSea: { lat: 36.5, lng: 17.5 },
  southPeloponnese: { lat: 35.8, lng: 22.4 },
  aegeanSea: { lat: 38.1, lng: 25.2 },
  dardanelles: { lat: 40.1, lng: 26.2 },
  seaOfMarmara: { lat: 40.75, lng: 28.2 },
  bosphorus: { lat: 41.2, lng: 29.15 },
  blackSeaMid: { lat: 42.8, lng: 35.0 },
  // Eastern Mediterranean / Suez / Red Sea / Persian Gulf
  easternMed: { lat: 33.8, lng: 27.5 },
  cyprusApproach: { lat: 34.3, lng: 32.5 },
  levantApproach: { lat: 32.0, lng: 32.2 },
  suezNorth: { lat: 31.3, lng: 32.35 },
  suezSouth: { lat: 29.9, lng: 32.57 },
  gulfOfSuez: { lat: 27.8, lng: 33.9 },
  straitsOfTiran: { lat: 27.95, lng: 34.47 },
  gulfOfAqaba: { lat: 28.7, lng: 34.6 },
  redSeaNorth: { lat: 24.0, lng: 36.8 },
  redSeaMid: { lat: 17.5, lng: 40.0 },
  babElMandeb: { lat: 12.6, lng: 43.4 },
  gulfOfAden: { lat: 12.3, lng: 48.0 },
  arabianSea: { lat: 15.0, lng: 57.5 },
  straitOfHormuz: { lat: 26.4, lng: 56.5 },
  persianGulfMid: { lat: 26.0, lng: 51.8 },
} satisfies Record<string, GeoPoint>;

// Waypoints leaving each loading port en route to the open North Atlantic.
// (Chicago's Great Lakes → St. Lawrence Seaway leg necessarily tracks an
// inland water corridor rather than open ocean.)
const PORT_EXIT_ROUTE: Record<string, GeoPoint[]> = {
  "Los Angeles, CA": [WP.offBajaNorth, WP.offCabo, WP.offCentralAmerica, WP.panamaPacific, WP.panamaAtlantic, WP.caribbeanExit],
  "Seattle, WA": [WP.offSanFrancisco, WP.offBajaNorth, WP.offCabo, WP.offCentralAmerica, WP.panamaPacific, WP.panamaAtlantic, WP.caribbeanExit],
  "Houston, TX": [WP.gulfMid, WP.floridaStraits],
  "Savannah, GA": [],
  "Newark, NJ": [WP.offGrandBanks],
  "Chicago, IL": [WP.mackinac, WP.stLawrenceExit, WP.offAvalon],
};

// Shared tail segments, reused across several destinations below.
const BLACK_SEA_APPROACH = [
  WP.offPortugal, WP.gibraltar, WP.sicilyStrait, WP.ionianSea, WP.southPeloponnese,
  WP.aegeanSea, WP.dardanelles, WP.seaOfMarmara, WP.bosphorus, WP.blackSeaMid,
];
const EASTERN_MED_APPROACH = [
  WP.offPortugal, WP.gibraltar, WP.sicilyStrait, WP.ionianSea, WP.easternMed, WP.cyprusApproach,
];
const SUEZ_TO_RED_SEA = [
  ...EASTERN_MED_APPROACH, WP.levantApproach, WP.suezNorth, WP.suezSouth, WP.gulfOfSuez,
];
const GULF_APPROACH = [...SUEZ_TO_RED_SEA, WP.redSeaNorth, WP.redSeaMid, WP.babElMandeb, WP.gulfOfAden, WP.arabianSea];

// Waypoints from the open North Atlantic (or Mediterranean/Red Sea corridor)
// approaching each destination port.
const DEST_APPROACH_ROUTE: Record<string, GeoPoint[]> = {
  "Rotterdam, Netherlands": [WP.englishChannel, WP.doverStrait],
  "Klaipėda, Lithuania": [WP.englishChannel, WP.doverStrait, WP.northSeaMid, WP.skagerrak, WP.kattegat, WP.oresund, WP.southBaltic],
  "Poti, Georgia": BLACK_SEA_APPROACH,
  "Bremerhaven, Germany": [WP.englishChannel, WP.doverStrait, WP.northSeaMid],
  "Gdańsk, Poland": [WP.englishChannel, WP.doverStrait, WP.northSeaMid, WP.skagerrak, WP.kattegat, WP.oresund, WP.southBaltic],
  "Batumi, Georgia": BLACK_SEA_APPROACH,
  "Constanța, Romania": BLACK_SEA_APPROACH,
  "Varna, Bulgaria": BLACK_SEA_APPROACH,
  "Mersin, Turkey": EASTERN_MED_APPROACH,
  "Beirut, Lebanon": EASTERN_MED_APPROACH,
  "Aqaba, Jordan": [...SUEZ_TO_RED_SEA, WP.straitsOfTiran, WP.gulfOfAqaba],
  "Dubai, United Arab Emirates": [...GULF_APPROACH, WP.straitOfHormuz, WP.persianGulfMid],
  "Dammam, Saudi Arabia": [...GULF_APPROACH, WP.straitOfHormuz, WP.persianGulfMid],
  "Doha, Qatar": [...GULF_APPROACH, WP.straitOfHormuz, WP.persianGulfMid],
  "Salalah, Oman": GULF_APPROACH,
};

/**
 * Full ocean-route waypoint list (loading port -> ... -> destination port),
 * endpoints excluded — the caller prepends/appends the port coordinates.
 */
export function oceanRouteWaypoints(loadingPortName: string, destinationPortName: string): GeoPoint[] {
  const exit = PORT_EXIT_ROUTE[loadingPortName] ?? [];
  const approach = DEST_APPROACH_ROUTE[destinationPortName] ?? [];
  return [...exit, ...approach];
}

function toUnitVector(p: GeoPoint): [number, number, number] {
  const lat = (p.lat * Math.PI) / 180;
  const lng = (p.lng * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
}

function fromUnitVector(v: [number, number, number]): GeoPoint {
  return {
    lat: (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI,
    lng: (Math.atan2(v[1], v[0]) * 180) / Math.PI,
  };
}

/**
 * Subdivides a waypoint route so no great-circle segment exceeds
 * maxSegmentDeg, interpolating along the great circle (slerp). The globe
 * renders each segment as a quadratic arc whose midpoint sags below the
 * sphere on long chords, so short segments keep the route visually glued
 * to the water surface — and give the draw-on animation fine granularity.
 */
export function densifyRoute(points: GeoPoint[], maxSegmentDeg = 6): GeoPoint[] {
  if (points.length < 2) return points;
  const out: GeoPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = toUnitVector(points[i - 1]);
    const b = toUnitVector(points[i]);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angle = Math.acos(dot);
    const steps = Math.max(1, Math.ceil((angle * 180) / Math.PI / maxSegmentDeg));
    const sinAngle = Math.sin(angle);
    for (let s = 1; s <= steps; s++) {
      if (s === steps || sinAngle < 1e-6) {
        out.push(points[i]);
        break;
      }
      const t = s / steps;
      const wa = Math.sin((1 - t) * angle) / sinAngle;
      const wb = Math.sin(t * angle) / sinAngle;
      out.push(
        fromUnitVector([
          wa * a[0] + wb * b[0],
          wa * a[1] + wb * b[1],
          wa * a[2] + wb * b[2],
        ])
      );
    }
  }
  return out;
}
