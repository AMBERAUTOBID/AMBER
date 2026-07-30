export type VehicleCategory = "automobile" | "motorcycle" | "truck" | "more";

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  "automobile",
  "motorcycle",
  "truck",
  "more",
];

const AUTOMOBILE_MAKES = [
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "Fiat",
  "Ford",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Porsche",
  "Rolls-Royce",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

const TRUCK_MAKES = [
  "Ford",
  "Chevrolet",
  "GMC",
  "Ram",
  "Toyota",
  "Nissan",
  "Jeep",
  "Freightliner",
  "International",
  "Kenworth",
  "Peterbilt",
  "Mack",
  "Western Star",
  "Isuzu",
  "Hino",
  "Volvo Trucks",
] as const;

const MOTORCYCLE_MAKES = [
  "Harley-Davidson",
  "Honda",
  "Yamaha",
  "Kawasaki",
  "Suzuki",
  "Ducati",
  "BMW",
  "Triumph",
  "KTM",
  "Indian",
  "Aprilia",
  "Royal Enfield",
  "Moto Guzzi",
  "Husqvarna",
  "Vespa",
  "Piaggio",
  "Can-Am",
  "Victory",
] as const;

// "More" spans equipment types rather than brands (boats, trailers, ATVs,
// heavy equipment, etc. don't share a manufacturer list the way cars do).
const MORE_TYPES = [
  "Trailer",
  "Boat",
  "ATV",
  "Bus",
  "Industrial Equipment",
  "Jet Ski",
  "Mobile Home",
  "Other",
] as const;

export const MAKES_BY_CATEGORY: Record<VehicleCategory, readonly string[]> = {
  automobile: AUTOMOBILE_MAKES,
  truck: TRUCK_MAKES,
  motorcycle: MOTORCYCLE_MAKES,
  more: MORE_TYPES,
};

export const MIN_YEAR = 1920;
export const MAX_YEAR = 2027;

export const YEAR_OPTIONS: string[] = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => String(MAX_YEAR - i)
);

const AUTOMOBILE_MODELS: Record<string, string[]> = {
  Acura: ["MDX", "RDX", "TLX", "ILX", "TSX", "RSX", "NSX", "Integra"],
  "Alfa Romeo": ["Giulia", "Stelvio", "4C", "Tonale"],
  "Aston Martin": ["DB11", "DB9", "Vantage", "DBS", "Rapide", "Vanquish"],
  Audi: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "TT", "R8", "e-tron", "S4", "RS6"],
  Bentley: ["Continental GT", "Flying Spur", "Bentayga", "Mulsanne"],
  BMW: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7", "M3", "M4", "M5", "Z4", "i4"],
  Buick: ["Enclave", "Encore", "Envision", "LaCrosse", "Regal"],
  Cadillac: ["Escalade", "CTS", "XT4", "XT5", "XT6", "ATS", "CT4", "CT5", "SRX"],
  Chevrolet: ["Camaro", "Corvette", "Malibu", "Equinox", "Tahoe", "Suburban", "Traverse", "Impala", "Cruze", "Blazer", "Trax"],
  Chrysler: ["300", "Pacifica", "Voyager", "Town & Country"],
  Dodge: ["Charger", "Challenger", "Durango", "Journey", "Grand Caravan", "Dart"],
  Ferrari: ["488", "F8", "Portofino", "Roma", "812", "California", "GTC4Lusso"],
  Fiat: ["500", "500X", "500L"],
  Ford: ["Mustang", "Explorer", "Escape", "Edge", "Focus", "Fusion", "Bronco", "Expedition", "Taurus", "EcoSport"],
  GMC: ["Yukon", "Acadia", "Terrain"],
  Honda: ["Civic", "Accord", "CR-V", "Pilot", "Odyssey", "HR-V", "Fit", "Passport", "Insight"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Accent", "Palisade", "Kona", "Veloster"],
  Infiniti: ["Q50", "Q60", "QX50", "QX60", "QX80", "G37", "FX35"],
  Jaguar: ["XF", "XE", "F-Pace", "F-Type", "XJ", "E-Pace"],
  Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Renegade", "Gladiator", "Patriot"],
  Kia: ["Optima", "K5", "Sorento", "Sportage", "Soul", "Forte", "Telluride", "Rio", "Seltos"],
  Lamborghini: ["Huracan", "Aventador", "Urus", "Gallardo"],
  "Land Rover": ["Range Rover", "Range Rover Sport", "Discovery", "Defender", "Range Rover Evoque", "Range Rover Velar"],
  Lexus: ["RX", "ES", "IS", "GX", "LX", "NX", "LS", "RC", "UX"],
  Maserati: ["Ghibli", "Quattroporte", "Levante", "GranTurismo"],
  Mazda: ["Mazda3", "Mazda6", "CX-5", "CX-9", "MX-5 Miata", "CX-30", "CX-50"],
  McLaren: ["570S", "720S", "650S", "GT", "540C"],
  "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLE", "GLC", "GLS", "A-Class", "CLA", "G-Class", "GLA"],
  Mini: ["Cooper", "Countryman", "Clubman", "Paceman"],
  Mitsubishi: ["Outlander", "Eclipse Cross", "Mirage", "Lancer", "Outlander Sport"],
  Nissan: ["Altima", "Sentra", "Rogue", "Murano", "Pathfinder", "Maxima", "Versa", "Kicks", "Armada"],
  Porsche: ["911", "Cayenne", "Macan", "Panamera", "Boxster", "Cayman", "Taycan", "718"],
  "Rolls-Royce": ["Ghost", "Phantom", "Wraith", "Cullinan", "Dawn"],
  Subaru: ["Outback", "Forester", "Impreza", "Legacy", "Crosstrek", "WRX", "Ascent", "BRZ"],
  Tesla: ["Model S", "Model 3", "Model X", "Model Y", "Cybertruck"],
  Toyota: ["Camry", "Corolla", "RAV4", "Highlander", "Sienna", "Prius", "Avalon", "C-HR", "Venza"],
  Volkswagen: ["Jetta", "Passat", "Golf", "Tiguan", "Atlas", "Beetle", "CC", "Arteon"],
  Volvo: ["XC90", "XC60", "S60", "S90", "XC40", "V60", "V90"],
};

const TRUCK_MODELS: Record<string, string[]> = {
  Ford: ["F-150", "F-250", "F-350", "Ranger", "Bronco", "Bronco Sport", "Super Duty"],
  Chevrolet: ["Silverado 1500", "Silverado 2500HD", "Silverado 3500HD", "Colorado"],
  GMC: ["Sierra 1500", "Sierra 2500HD", "Sierra 3500HD", "Canyon"],
  Ram: ["1500", "2500", "3500", "ProMaster", "ProMaster City"],
  Toyota: ["Tacoma", "Tundra"],
  Nissan: ["Titan", "Frontier", "NV Cargo"],
  Jeep: ["Gladiator"],
  Freightliner: ["Cascadia", "Columbia", "Century Class", "M2 106"],
  International: ["LT Series", "ProStar", "DuraStar", "9900i"],
  Kenworth: ["T680", "T880", "W900", "T800"],
  Peterbilt: ["379", "389", "579", "567"],
  Mack: ["Anthem", "Pinnacle", "Granite", "CH613"],
  "Western Star": ["4900", "5700XE", "49X"],
  Isuzu: ["NPR", "NQR", "FTR"],
  Hino: ["268", "338", "155"],
  "Volvo Trucks": ["VNL", "VNR", "VHD"],
};

const MOTORCYCLE_MODELS: Record<string, string[]> = {
  "Harley-Davidson": ["Sportster", "Softail", "Road King", "Street Glide", "Road Glide", "Fat Boy", "Iron 883", "Low Rider"],
  Honda: ["CBR600RR", "CBR1000RR", "Gold Wing", "Rebel", "Africa Twin", "Shadow", "CB500F"],
  Yamaha: ["YZF-R1", "YZF-R6", "MT-07", "MT-09", "V Star", "Bolt", "Tenere 700"],
  Kawasaki: ["Ninja 400", "Ninja ZX-6R", "Ninja ZX-10R", "Vulcan", "Z900", "KLR650"],
  Suzuki: ["GSX-R600", "GSX-R750", "GSX-R1000", "Boulevard", "V-Strom"],
  Ducati: ["Panigale", "Monster", "Multistrada", "Diavel", "Scrambler"],
  BMW: ["R 1250 GS", "S 1000 RR", "F 850 GS", "R nineT", "K 1600"],
  Triumph: ["Bonneville", "Street Triple", "Speed Triple", "Tiger", "Rocket 3"],
  KTM: ["Duke 390", "Duke 890", "1290 Super Duke", "Adventure 790"],
  Indian: ["Scout", "Chief", "Chieftain", "Springfield", "FTR 1200"],
  Aprilia: ["RSV4", "Tuono", "RS 660"],
  "Royal Enfield": ["Classic 350", "Meteor 350", "Himalayan", "Interceptor 650"],
  "Moto Guzzi": ["V7", "V85 TT", "California"],
  Husqvarna: ["Vitpilen", "Svartpilen", "701 Enduro"],
  Vespa: ["Primavera", "GTS", "Sprint"],
  Piaggio: ["MP3", "Liberty"],
  "Can-Am": ["Spyder RT", "Spyder F3", "Ryker"],
  Victory: ["Vegas", "Cross Country", "Hammer"],
};

/**
 * Make → model lists, scoped per category (the same make can mean different
 * things in different categories — e.g. Ford/Automobile is Mustang and
 * Explorer, Ford/Truck is F-150 and Ranger).
 *
 * "more" is intentionally empty: its first-level picker is an equipment
 * type (Boat, Trailer, ATV, ...), not a brand, so there's no consistent
 * "model" concept to offer underneath it.
 */
export const MODELS_BY_CATEGORY: Record<VehicleCategory, Record<string, string[]>> = {
  automobile: AUTOMOBILE_MODELS,
  truck: TRUCK_MODELS,
  motorcycle: MOTORCYCLE_MODELS,
  more: {},
};
