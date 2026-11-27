import type { City } from "@/lib/api/client";
import type { LonLat } from "./geo";

export type FacilityType = "hospital" | "clinic";

export interface HealthFacility {
  id: string;
  name: string;
  nameBn: string;
  type: FacilityType;
  city: City;
  position: LonLat;
  address: string;
  phone: string | null;
  emergency: "yes" | "unknown";
  bedsTag?: string;
}

/**
 * Community-mapped Bangladesh hospital & clinic directory across all five covered city corporations
 * (OpenStreetMap reference coordinates; not live DGHS bed, roster, or admission status).
 */
export const BANGLADESH_FACILITIES: readonly HealthFacility[] = [
  // --- Dhaka South (DSCC) ---
  {
    id: "dmch",
    name: "Dhaka Medical College Hospital (DMCH)",
    nameBn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3976, 23.7258],
    address: "Secretariat Rd, Bakshi Bazar, Dhaka 1000",
    phone: "+880 2-55165088",
    emergency: "yes",
    bedsTag: "2,600 beds (OSM tag)",
  },
  {
    id: "bsmmu",
    name: "Bangabandhu Sheikh Mujib Medical University (BSMMU)",
    nameBn: "বঙ্গবন্ধু শেখ মুজিব মেডিকেল বিশ্ববিদ্যালয়",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3949, 23.7388],
    address: "Kazi Nazrul Islam Ave, Shahbagh, Dhaka 1000",
    phone: "+880 2-55165760",
    emergency: "yes",
    bedsTag: "1,900 beds (OSM tag)",
  },
  {
    id: "mugda-mch",
    name: "Mugda Medical College & Hospital",
    nameBn: "মুগদা মেডিকেল কলেজ ও হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.4316, 23.7327],
    address: "Hazi Kadam Ali Rd, Mugda, Dhaka 1214",
    phone: "+880 2-7277101",
    emergency: "yes",
    bedsTag: "500 beds (OSM tag)",
  },
  {
    id: "birdem",
    name: "BIRDEM General Hospital",
    nameBn: "বারডেম জেনারেল হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3968, 23.7393],
    address: "122 Kazi Nazrul Islam Ave, Shahbagh, Dhaka 1000",
    phone: "+880 2-9661551",
    emergency: "yes",
  },
  {
    id: "mitford",
    name: "Sir Salimullah Medical College & Mitford Hospital",
    nameBn: "স্যার সলিমুল্লাহ মেডিকেল কলেজ ও মিটফোর্ড হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.4008, 23.7112],
    address: "Mitford Rd, Old Dhaka 1100",
    phone: "+880 2-57319002",
    emergency: "yes",
    bedsTag: "900 beds (OSM tag)",
  },
  {
    id: "holy-family",
    name: "Holy Family Red Crescent Medical College Hospital",
    nameBn: "হলি ফ্যামিলি রেড ক্রিসেন্ট হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.4036, 23.7458],
    address: "1 Eskaton Garden Rd, Dhaka 1000",
    phone: "+880 2-48311721",
    emergency: "yes",
  },
  {
    id: "square-hospital",
    name: "Square Hospitals Ltd.",
    nameBn: "স্কয়ার হাসপাতাল লিমিটেড",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3816, 23.7529],
    address: "18/F Bir Uttam Qazi Nuruzzaman Sarak, Panthapath",
    phone: "+880 2-8144400",
    emergency: "yes",
    bedsTag: "400 beds (OSM tag)",
  },
  {
    id: "central-hospital",
    name: "Central Hospital Limited",
    nameBn: "সেন্ট্রাল হাসপাতাল লিমিটেড",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3827, 23.7438],
    address: "House 2, Road 5, Green Rd, Dhanmondi, Dhaka 1205",
    phone: "+880 2-9660015",
    emergency: "yes",
  },
  {
    id: "labaid",
    name: "Labaid Specialized Hospital",
    nameBn: "ল্যাবএইড স্পেশালাইজড হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3831, 23.7418],
    address: "House 1, Road 4, Dhanmondi, Dhaka 1205",
    phone: "+880 2-58610793",
    emergency: "yes",
  },
  {
    id: "ibn-sina-dhanmondi",
    name: "Ibn Sina Specialized Hospital, Dhanmondi",
    nameBn: "ইবনে সিনা স্পেশালাইজড হাসপাতাল, ধানমন্ডি",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3719, 23.7463],
    address: "House 68, Road 15/A, Dhanmondi, Dhaka 1209",
    phone: "+880 2-48115270",
    emergency: "yes",
  },
  {
    id: "popular-dhanmondi",
    name: "Popular Diagnostic & Medical Centre, Dhanmondi",
    nameBn: "পপুলার ডায়াগনস্টিক সেন্টার, ধানমন্ডি",
    type: "clinic",
    city: "Dhaka South",
    position: [90.3819, 23.7393],
    address: "House 16, Road 2, Dhanmondi, Dhaka 1205",
    phone: "+880 9666-787801",
    emergency: "unknown",
  },
  {
    id: "green-life",
    name: "Green Life Medical College & Hospital",
    nameBn: "গ্রিন লাইফ মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3863, 23.7429],
    address: "32 Bir Uttam K.M. Shafiullah Sarak, Green Rd",
    phone: "+880 2-9612345",
    emergency: "yes",
  },
  {
    id: "anwer-khan",
    name: "Anwer Khan Modern Medical College Hospital",
    nameBn: "আনোয়ার খান মডার্ন মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Dhaka South",
    position: [90.3812, 23.7453],
    address: "House 17, Road 8, Dhanmondi, Dhaka 1205",
    phone: "+880 2-58616074",
    emergency: "yes",
  },
  {
    id: "khilgaon-clinic",
    name: "Khilgaon Urban Primary Health Clinic",
    nameBn: "খিলগাঁও আরবান প্রাইমারি হেলথ ক্লিনিক",
    type: "clinic",
    city: "Dhaka South",
    position: [90.4242, 23.7495],
    address: "Taltola Market Ln, Khilgaon, Dhaka 1219",
    phone: null,
    emergency: "unknown",
  },

  // --- Dhaka North (DNCC) ---
  {
    id: "impulse-hospital",
    name: "Impulse Hospital, Tejgaon",
    nameBn: "ইমপালস হাসপাতাল, তেজগাঁও",
    type: "hospital",
    city: "Dhaka North",
    position: [90.3988, 23.7664],
    address: "304/E Bir Uttam Mir Shawkat Sarak, Tejgaon, Dhaka 1208",
    phone: "+880 2-9831032",
    emergency: "yes",
  },
  {
    id: "dncc-dengue-hospital",
    name: "DNCC Dedicated Dengue & COVID Hospital",
    nameBn: "ডিএনসিসি ডেডিকেটেড ডেঙ্গু হাসপাতাল, মহাখালী",
    type: "hospital",
    city: "Dhaka North",
    position: [90.3991, 23.7768],
    address: "Mohakhali DNCC Market Complex, Dhaka 1212",
    phone: "+880 2-58814001",
    emergency: "yes",
    bedsTag: "1,000 beds (OSM tag)",
  },
  {
    id: "icddrb-mohakhali",
    name: "icddr,b Dhaka Hospital, Mohakhali",
    nameBn: "আইসিডিডিআর,বি ঢাকা হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4004, 23.7759],
    address: "68 Shaheed Tajuddin Ahmed Sarani, Mohakhali, Dhaka 1212",
    phone: "+880 2-222277001",
    emergency: "yes",
  },
  {
    id: "nidch",
    name: "National Institute of Diseases of the Chest & Hospital",
    nameBn: "জাতীয় বক্ষব্যাধি ইনস্টিটিউট ও হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4077, 23.7782],
    address: "TB Gate Rd, Mohakhali, Dhaka 1212",
    phone: "+880 2-55067101",
    emergency: "yes",
  },
  {
    id: "universal-mch",
    name: "Universal Medical College & Hospital",
    nameBn: "ইউনিভার্সাল মেডিকেল কলেজ ও হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.3977, 23.7731],
    address: "74G/75 Pea-cock Square, Mohakhali, Dhaka 1215",
    phone: "+880 9606-111222",
    emergency: "yes",
  },
  {
    id: "united-hospital",
    name: "United Hospital Limited",
    nameBn: "ইউনাইটেড হাসপাতাল লিমিটেড",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4158, 23.8047],
    address: "Plot 15, Rd 71, Gulshan-2, Dhaka 1212",
    phone: "+880 2-8836444",
    emergency: "yes",
    bedsTag: "500 beds (OSM tag)",
  },
  {
    id: "evercare-dhaka",
    name: "Evercare Hospital Dhaka",
    nameBn: "এভারকেয়ার হাসপাতাল ঢাকা",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4314, 23.8101],
    address: "Plot 81, Block E, Bashundhara R/A, Dhaka 1229",
    phone: "+880 2-55037242",
    emergency: "yes",
    bedsTag: "425 beds (OSM tag)",
  },
  {
    id: "kurmitola",
    name: "Kurmitola General Hospital",
    nameBn: "কুর্মিটোলা জেনারেল হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4093, 23.8211],
    address: "New Airport Rd, Cantonment, Dhaka 1206",
    phone: "+880 2-55062388",
    emergency: "yes",
    bedsTag: "500 beds (OSM tag)",
  },
  {
    id: "suhrawardy",
    name: "Shaheed Suhrawardy Medical College Hospital",
    nameBn: "শহীদ সোহরাওয়ার্দী মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.3712, 23.7697],
    address: "Sher-e-Bangla Nagar, Dhaka 1207",
    phone: "+880 2-9130800",
    emergency: "yes",
  },
  {
    id: "bd-specialized",
    name: "Bangladesh Specialized Hospital",
    nameBn: "বাংলাদেশ স্পেশালাইজড হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.3654, 23.7746],
    address: "21 Shyamoli, Mirpur Rd, Dhaka 1207",
    phone: "+880 9666-700100",
    emergency: "yes",
  },
  {
    id: "uttara-crescent",
    name: "Uttara Crescent Hospital",
    nameBn: "উত্তরা ক্রিসেন্ট হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4005, 23.8685],
    address: "House 21, Rabindra Sarani, Sector 7, Uttara",
    phone: "+880 2-58955240",
    emergency: "yes",
  },
  {
    id: "kuwait-friendship",
    name: "Kuwait Bangladesh Friendship Govt. Hospital",
    nameBn: "কুয়েত বাংলাদেশ মৈত্রী সরকারি হাসপাতাল",
    type: "hospital",
    city: "Dhaka North",
    position: [90.4036, 23.8729],
    address: "Isakha Ave, Sector 6, Uttara, Dhaka 1230",
    phone: "+880 2-48954016",
    emergency: "yes",
  },
  {
    id: "praava-banani",
    name: "Praava Health Family Clinic, Banani",
    nameBn: "প্রাভা হেলথ ক্লিনিক, বনানী",
    type: "clinic",
    city: "Dhaka North",
    position: [90.4041, 23.7924],
    address: "Plot 9, Road 17, Block C, Banani, Dhaka 1213",
    phone: "+880 9606-277228",
    emergency: "unknown",
  },

  // --- Chattogram (CCC) ---
  {
    id: "cmch",
    name: "Chittagong Medical College Hospital (CMCH)",
    nameBn: "চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Chattogram",
    position: [91.8305, 22.3596],
    address: "57 K.B. Fazlul Kader Rd, Panchlaish, Chattogram 4203",
    phone: "+880 31-630335",
    emergency: "yes",
    bedsTag: "1,313 beds (OSM tag)",
  },
  {
    id: "evercare-ctg",
    name: "Evercare Hospital Chattogram",
    nameBn: "এভারকেয়ার হাসপাতাল চট্টগ্রাম",
    type: "hospital",
    city: "Chattogram",
    position: [91.8742, 22.4046],
    address: "Plot H1, Ananya R/A, Oxygen-Kuwaish Rd, Chattogram",
    phone: "+880 9610-810663",
    emergency: "yes",
    bedsTag: "470 beds (OSM tag)",
  },
  {
    id: "imperial-ctg",
    name: "Imperial Hospital Limited",
    nameBn: "ইম্পেরিয়াল হাসপাতাল লিমিটেড",
    type: "hospital",
    city: "Chattogram",
    position: [91.7975, 22.3591],
    address: "Zakir Hossain Rd, Pahartali, Chattogram 4202",
    phone: "+880 9612-247247",
    emergency: "yes",
    bedsTag: "375 beds (OSM tag)",
  },
  {
    id: "parkview-ctg",
    name: "Parkview Hospital Limited",
    nameBn: "পার্কভিউ হাসপাতাল লিমিটেড",
    type: "hospital",
    city: "Chattogram",
    position: [91.8321, 22.3619],
    address: "94/103 Katalganj, Panchlaish, Chattogram",
    phone: "+880 9610-818888",
    emergency: "yes",
  },
  {
    id: "ctg-general",
    name: "Chattogram 250-Bed General Hospital",
    nameBn: "চট্টগ্রাম ২৫০ শয্যা জেনারেল হাসপাতাল",
    type: "hospital",
    city: "Chattogram",
    position: [91.8359, 22.3446],
    address: "Anderkilla, Chattogram 4000",
    phone: "+880 31-611407",
    emergency: "yes",
  },
  {
    id: "max-ctg",
    name: "Max Hospital & Diagnostic Ltd.",
    nameBn: "ম্যাক্স হাসপাতাল ও ডায়াগনস্টিক",
    type: "hospital",
    city: "Chattogram",
    position: [91.8253, 22.3563],
    address: "35/36 Mehedibag Rd, Chattogram",
    phone: "+880 31-622519",
    emergency: "yes",
  },
  {
    id: "cscr-ctg",
    name: "CSCR Hospital (Pvt.) Ltd.",
    nameBn: "সিএসসিআর হাসপাতাল",
    type: "hospital",
    city: "Chattogram",
    position: [91.8315, 22.3578],
    address: "1675/A O.R. Nizam Rd, Probortak Circle",
    phone: "+880 31-656565",
    emergency: "yes",
  },
  {
    id: "maa-o-shishu-ctg",
    name: "Chittagong Maa-O-Shishu Hospital",
    nameBn: "চট্টগ্রাম মা ও শিশু হাসপাতাল",
    type: "hospital",
    city: "Chattogram",
    position: [91.8077, 22.3274],
    address: "Agrabad, Chattogram 4100",
    phone: "+880 31-711236",
    emergency: "yes",
  },
  {
    id: "aig-ctg",
    name: "Asian Specialized Hospital Ltd.",
    nameBn: "এশিয়ান স্পেশালাইজড হাসপাতাল",
    type: "hospital",
    city: "Chattogram",
    position: [91.8245, 22.3592],
    address: "O.R. Nizam Rd, Panchlaish, Chattogram",
    phone: null,
    emergency: "unknown",
  },
  {
    id: "epic-ctg",
    name: "Epic Health Care Diagnostic Clinic",
    nameBn: "এপিক হেলথ কেয়ার ক্লিনিক",
    type: "clinic",
    city: "Chattogram",
    position: [91.8299, 22.3591],
    address: "19 K.B. Fazlul Kader Rd, opposite CMCH",
    phone: "+880 1984-499600",
    emergency: "unknown",
  },

  // --- Gazipur (GCC) ---
  {
    id: "tajuddin-mch",
    name: "Shaheed Tajuddin Ahmad Medical College Hospital",
    nameBn: "শহীদ তাজউদ্দীন আহমদ মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Gazipur",
    position: [90.4152, 23.9964],
    address: "Hospital Rd, Joydebpur, Gazipur 1700",
    phone: "+880 2-49261655",
    emergency: "yes",
    bedsTag: "500 beds (OSM tag)",
  },
  {
    id: "tairunnessa-mch",
    name: "Tairunnessa Memorial Medical College Hospital",
    nameBn: "তাইরুননেছা মেমোরিয়াল মেডিকেল কলেজ হাসপাতাল",
    type: "hospital",
    city: "Gazipur",
    position: [90.3917, 23.9242],
    address: "Kunia, National University Rd, Board Bazar, Gazipur",
    phone: "+880 1711-000881",
    emergency: "yes",
  },
  {
    id: "international-mch-tongi",
    name: "International Medical College & Hospital",
    nameBn: "ইন্টারন্যাশনাল মেডিকেল কলেজ হাসপাতাল, টঙ্গী",
    type: "hospital",
    city: "Gazipur",
    position: [90.3935, 23.9145],
    address: "Gushulia, Sataish, Tongi, Gazipur 1711",
    phone: "+880 2-9814712",
    emergency: "yes",
  },
  {
    id: "tongi-govt-hospital",
    name: "Shaheed Ahsan Ullah Master General Hospital",
    nameBn: "শহীদ আহসান উল্লাহ মাস্টার জেনারেল হাসপাতাল, টঙ্গী",
    type: "hospital",
    city: "Gazipur",
    position: [90.4021, 23.8984],
    address: "Station Rd, Tongi, Gazipur 1710",
    phone: "+880 2-9815540",
    emergency: "yes",
  },
  {
    id: "gazipur-clinic",
    name: "Popular Consultation Clinic, Gazipur",
    nameBn: "পপুলার কনসালটেশন ক্লিনিক, গাজীপুর",
    type: "clinic",
    city: "Gazipur",
    position: [90.4198, 23.9989],
    address: "Shibbari More, Joydebpur, Gazipur 1700",
    phone: null,
    emergency: "unknown",
  },

  // --- Narayanganj (NCC) ---
  {
    id: "khanpur-300",
    name: "Narayanganj 300-Bed Hospital, Khanpur",
    nameBn: "নারায়ণগঞ্জ ৩০০ শয্যা হাসপাতাল, খানপুর",
    type: "hospital",
    city: "Narayanganj",
    position: [90.5028, 23.6272],
    address: "Khanpur Main Rd, Narayanganj 1400",
    phone: "+880 2-7647901",
    emergency: "yes",
    bedsTag: "300 beds (OSM tag)",
  },
  {
    id: "victoria-nganj",
    name: "Narayanganj General (Victoria) Hospital",
    nameBn: "নারায়ণগঞ্জ জেনারেল (ভিক্টোরিয়া) হাসপাতাল",
    type: "hospital",
    city: "Narayanganj",
    position: [90.5059, 23.6194],
    address: "Sirajuddoula Rd, Chashara, Narayanganj 1400",
    phone: "+880 2-7630511",
    emergency: "yes",
  },
  {
    id: "pro-active-mch",
    name: "Pro-Active Medical College & Hospital",
    nameBn: "প্রো-অ্যাকটিভ মেডিকেল কলেজ ও হাসপাতাল",
    type: "hospital",
    city: "Narayanganj",
    position: [90.4783, 23.6948],
    address: "Signboard More, Siddhirganj, Narayanganj",
    phone: "+880 1902-556060",
    emergency: "yes",
  },
  {
    id: "popular-nganj",
    name: "Popular Diagnostic & Clinic, Narayanganj",
    nameBn: "পপুলার ডায়াগনস্টিক ও ক্লিনিক, নারায়ণগঞ্জ",
    type: "clinic",
    city: "Narayanganj",
    position: [90.4991, 23.6233],
    address: "231/4 Bangabandhu Rd, Chashara, Narayanganj",
    phone: "+880 9613-787804",
    emergency: "unknown",
  },
  {
    id: "medinova-nganj",
    name: "Medinova Medical Services, Narayanganj",
    nameBn: "মেডিনোভা মেডিকেল সার্ভিসেস, নারায়ণগঞ্জ",
    type: "clinic",
    city: "Narayanganj",
    position: [90.4981, 23.6226],
    address: "Chashara Main Rd, Narayanganj 1400",
    phone: null,
    emergency: "unknown",
  },
] as const;

const EARTH_RADIUS_KM = 6371;

/** Spherical Haversine distance in kilometers between two [lon, lat] positions. */
export function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Generates a closed 6-vertex GeoJSON ring ([lon, lat][]) for 3D extruded ward risk prisms,
 * compensating for longitude cosine foreshortening at Bangladesh latitudes.
 */
export function createHexagonPolygon(center: LonLat, radiusMeters: number): [number, number][] {
  const [lon, lat] = center;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = metersPerDegLat * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusMeters / metersPerDegLat;
  const dLon = radiusMeters / metersPerDegLon;

  const ring: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

export function rankFacilitiesByAirDistance(
  origin: LonLat,
  facilities: readonly HealthFacility[],
  filter: "all" | FacilityType = "all",
): Array<HealthFacility & { airKm: number }> {
  return facilities
    .filter((f) => filter === "all" || f.type === filter)
    .map((f) => ({ ...f, airKm: haversineKm(origin, f.position) }))
    .sort((a, b) => a.airKm - b.airKm);
}
