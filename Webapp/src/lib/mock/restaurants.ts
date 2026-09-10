import type { Recipe, Restaurant } from "@/types";

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=60`;

export const RESTAURANTS: Restaurant[] = [
  {
    id: "v_1",
    slug: "organik-grocer-thao-dien",
    name: "Organik Grocer",
    kind: "shop",
    veganLevel: "veg-friendly",
    coverUrl: img("1542838132-92c53300491e"),
    address: "21 Thảo Điền, Thủ Đức",
    city: "Ho Chi Minh City",
    coords: { lat: 10.8031, lng: 106.7336 },
    distanceKm: 3.8,
    rating: 4.5,
    reviewCount: 212,
    priceLevel: 3,
    tags: ["Organic", "Bulk bins", "Imported"],
    isOpenNow: true,
    openingHours: "8:00 – 21:00",
    carries: ["Firm tofu", "Tamari", "Coconut sugar", "Raw cashews", "Nutritional yeast", "Chia seeds", "Tahini", "Quinoa", "Coconut yogurt", "Harissa paste", "Vegan mozzarella", "Vegan basil pesto", "Oat milk", "Red lentils"],
  },
  {
    id: "v_2",
    slug: "cho-ben-thanh-rau-cu",
    name: "Bến Thành Market — Veg stalls",
    kind: "market",
    veganLevel: "veg-friendly",
    coverUrl: img("1488459716781-31db52582fe9"),
    address: "Lê Lợi, District 1",
    city: "Ho Chi Minh City",
    coords: { lat: 10.7725, lng: 106.698 },
    distanceKm: 1.6,
    rating: 4.2,
    reviewCount: 1840,
    priceLevel: 1,
    tags: ["Fresh herbs", "Cheap", "Cash only"],
    isOpenNow: true,
    openingHours: "6:00 – 18:00",
    carries: ["Lemongrass", "Garlic", "Bird's eye chili", "Carrot", "Cucumber", "Mint & cilantro", "Lime juice", "Firm tofu", "Jasmine rice", "Fresh ginger", "Spring onion", "Red cabbage", "Sweet potato", "Onion", "Ripe mango"],
  },
  {
    id: "v_3",
    slug: "an-nhien-vegan-mart",
    name: "An Nhiên Vegan Mart",
    kind: "shop",
    veganLevel: "vegan",
    coverUrl: img("1604719312566-8912e9227c6a"),
    address: "112 Trần Quang Khải, District 1",
    city: "Ho Chi Minh City",
    coords: { lat: 10.7911, lng: 106.6899 },
    distanceKm: 2.1,
    rating: 4.8,
    reviewCount: 96,
    priceLevel: 2,
    tags: ["100% vegan", "Mock meats", "Local brands"],
    isOpenNow: false,
    openingHours: "9:00 – 20:30",
    carries: ["Firm tofu", "Tamari", "Soy sauce", "Rice vinegar", "Coconut sugar", "Vegan mozzarella", "Coconut yogurt", "Oat milk", "Shelled edamame", "Peanut butter", "Chickpeas"],
  },
  {
    id: "v_4",
    slug: "hum-vegetarian-cafe",
    name: "Hum Vegetarian Café",
    kind: "restaurant",
    veganLevel: "vegetarian",
    coverUrl: img("1414235077428-338989a2e8c0"),
    address: "32 Võ Văn Tần, District 3",
    city: "Ho Chi Minh City",
    coords: { lat: 10.7769, lng: 106.6907 },
    distanceKm: 1.2,
    rating: 4.7,
    reviewCount: 3021,
    priceLevel: 3,
    tags: ["Vietnamese", "Date night", "Vegan options"],
    isOpenNow: true,
    openingHours: "10:00 – 22:00",
  },
  {
    id: "v_5",
    slug: "loving-hut-hoa-dang",
    name: "Loving Hut Hoa Đăng",
    kind: "restaurant",
    veganLevel: "vegan",
    coverUrl: img("1517248135467-4c7edcad34c4"),
    address: "38 Huỳnh Khương Ninh, Bình Thạnh",
    city: "Ho Chi Minh City",
    coords: { lat: 10.7902, lng: 106.6958 },
    distanceKm: 4.1,
    rating: 4.6,
    reviewCount: 1455,
    priceLevel: 1,
    tags: ["Buffet", "Budget", "Cơm chay"],
    isOpenNow: true,
    openingHours: "7:00 – 21:00",
  },
];

/** Shops that stock at least one ingredient of the recipe, with the matched names. */
export function getShopsForRecipe(recipe: Recipe) {
  const names = new Set(recipe.ingredients.map((i) => i.name));
  return RESTAURANTS.filter((v) => v.kind === "shop" || v.kind === "market")
    .map((v) => ({ venue: v, matched: (v.carries ?? []).filter((c) => names.has(c)) }))
    .filter((x) => x.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length);
}

export const getRestaurantsNearby = (limit = 2) =>
  RESTAURANTS.filter((v) => v.kind === "restaurant" || v.kind === "cafe")
    .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
    .slice(0, limit);
