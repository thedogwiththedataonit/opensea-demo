import { Collection, NFT, Activity } from "./types";

// ---- Helper to generate placeholder SVG image URLs ----
function collectionImage(name: string, hue: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue},70%,40%)"/>
        <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},70%,30%)"/>
      </linearGradient></defs>
      <rect width="200" height="200" fill="url(#g)"/>
      <text x="100" y="110" text-anchor="middle" fill="white" font-size="18" font-family="sans-serif">${name.slice(0, 12)}</text>
    </svg>`
  )}`;
}

function bannerImage(hue: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue},60%,25%)"/>
        <stop offset="100%" style="stop-color:hsl(${(hue + 90) % 360},60%,35%)"/>
      </linearGradient></defs>
      <rect width="1200" height="400" fill="url(#g)"/>
    </svg>`
  )}`;
}

export const collections: Collection[] = [
  {
    slug: "cryptopunks",
    name: "CryptoPunks",
    description: "CryptoPunks launched as a fixed set of 10,000 items in mid-2017 and became one of the inspirations for the ERC-721 standard.",
    imageUrl: collectionImage("CryptoPunks", 270),
    bannerUrl: bannerImage(270),
    floorPrice: 29.19,
    floorCurrency: "ETH",
    totalVolume: 1080000,
    totalVolumeCurrency: "ETH",
    itemCount: 10000,
    ownerCount: 3800,
    listedPct: 3.1,
    chain: "ethereum",
    verified: true,
    creatorName: "LarvaLabs",
    category: "pfps",
    change1d: 8.2,
    change7d: 12.5,
    createdAt: "2017-06-23T00:00:00Z",
  },
  {
    slug: "pudgy-penguins",
    name: "Pudgy Penguins",
    description: "Pudgy Penguins is a collection of 8,888 NFTs, waddling through Web3.",
    imageUrl: collectionImage("Pudgy Penguins", 200),
    bannerUrl: bannerImage(200),
    floorPrice: 4.18,
    floorCurrency: "ETH",
    totalVolume: 245000,
    totalVolumeCurrency: "ETH",
    itemCount: 8888,
    ownerCount: 4900,
    listedPct: 4.2,
    chain: "ethereum",
    verified: true,
    creatorName: "PudgyPenguins",
    category: "pfps",
    change1d: 1.2,
    change7d: -3.4,
    createdAt: "2021-07-01T00:00:00Z",
  },
  {
    slug: "hypurr",
    name: "Hypurr",
    description: "Hypurr is a collection of 5,555 unique digital cats living on HyperEVM.",
    imageUrl: collectionImage("Hypurr", 30),
    bannerUrl: bannerImage(30),
    floorPrice: 469.0,
    floorCurrency: "HYPE",
    totalVolume: 820000,
    totalVolumeCurrency: "HYPE",
    itemCount: 5555,
    ownerCount: 3200,
    listedPct: 2.8,
    chain: "ethereum",
    verified: true,
    creatorName: "HypurrLabs",
    category: "pfps",
    change1d: -8.8,
    change7d: -12.1,
    createdAt: "2023-03-15T00:00:00Z",
  },
  {
    slug: "bored-ape-yacht-club",
    name: "Bored Ape Yacht Club",
    description: "A collection of 10,000 unique Bored Ape NFTs living on the Ethereum blockchain.",
    imageUrl: collectionImage("BAYC", 40),
    bannerUrl: bannerImage(40),
    floorPrice: 5.43,
    floorCurrency: "ETH",
    totalVolume: 890000,
    totalVolumeCurrency: "ETH",
    itemCount: 10000,
    ownerCount: 5600,
    listedPct: 1.9,
    chain: "ethereum",
    verified: true,
    creatorName: "YugaLabs",
    category: "pfps",
    change1d: -0.4,
    change7d: 2.1,
    createdAt: "2021-04-30T00:00:00Z",
  },
  {
    slug: "moonbirds",
    name: "Moonbirds",
    description: "A collection of 10,000 utility-enabled PFPs that feature a richly diverse and unique collection of owls.",
    imageUrl: collectionImage("Moonbirds", 180),
    bannerUrl: bannerImage(180),
    floorPrice: 1.21,
    floorCurrency: "ETH",
    totalVolume: 320000,
    totalVolumeCurrency: "ETH",
    itemCount: 10000,
    ownerCount: 6400,
    listedPct: 5.2,
    chain: "ethereum",
    verified: true,
    creatorName: "PROOF",
    category: "pfps",
    change1d: -1.2,
    change7d: 0.8,
    createdAt: "2022-04-16T00:00:00Z",
  },
  {
    slug: "lil-pudgys",
    name: "Lil Pudgys",
    description: "Lil Pudgys are a collection of 22,222 randomly generated NFTs on the Ethereum blockchain.",
    imageUrl: collectionImage("Lil Pudgys", 210),
    bannerUrl: bannerImage(210),
    floorPrice: 0.48,
    floorCurrency: "ETH",
    totalVolume: 98000,
    totalVolumeCurrency: "ETH",
    itemCount: 22222,
    ownerCount: 9800,
    listedPct: 3.4,
    chain: "ethereum",
    verified: true,
    creatorName: "PudgyPenguins",
    category: "pfps",
    change1d: 0.6,
    change7d: -1.5,
    createdAt: "2022-09-01T00:00:00Z",
  },
  {
    slug: "mutant-ape-yacht-club",
    name: "Mutant Ape Yacht Club",
    description: "The MUTANT APE YACHT CLUB is a collection of up to 20,000 Mutant Apes.",
    imageUrl: collectionImage("MAYC", 120),
    bannerUrl: bannerImage(120),
    floorPrice: 0.78,
    floorCurrency: "ETH",
    totalVolume: 560000,
    totalVolumeCurrency: "ETH",
    itemCount: 19423,
    ownerCount: 12100,
    listedPct: 4.1,
    chain: "ethereum",
    verified: true,
    creatorName: "YugaLabs",
    category: "pfps",
    change1d: 1.0,
    change7d: -2.3,
    createdAt: "2021-08-29T00:00:00Z",
  },
  {
    slug: "milady-maker",
    name: "Milady Maker",
    description: "Milady Maker is a collection of 10,000 generative pfpNFTs in a neochibi aesthetic.",
    imageUrl: collectionImage("Milady", 300),
    bannerUrl: bannerImage(300),
    floorPrice: 0.97,
    floorCurrency: "ETH",
    totalVolume: 142000,
    totalVolumeCurrency: "ETH",
    itemCount: 10000,
    ownerCount: 4800,
    listedPct: 3.7,
    chain: "ethereum",
    verified: true,
    creatorName: "Remilia",
    category: "pfps",
    change1d: -0.8,
    change7d: 5.2,
    createdAt: "2021-09-15T00:00:00Z",
  },
  {
    slug: "axie-land",
    name: "Axie Land",
    description: "Axie Infinity land plots in the Lunacia metaverse.",
    imageUrl: collectionImage("Axie Land", 60),
    bannerUrl: bannerImage(60),
    floorPrice: 1700.0,
    floorCurrency: "RON",
    totalVolume: 450000,
    totalVolumeCurrency: "RON",
    itemCount: 90601,
    ownerCount: 18400,
    listedPct: 2.1,
    chain: "ronin",
    verified: true,
    creatorName: "AxieInfinity",
    category: "gaming",
    change1d: 0.0,
    change7d: -1.2,
    createdAt: "2020-01-01T00:00:00Z",
  },
  {
    slug: "dx-terminal",
    name: "DX Terminal",
    description: "DX Terminal is a collection of 5,000 access passes to the DX ecosystem.",
    imageUrl: collectionImage("DX Terminal", 0),
    bannerUrl: bannerImage(0),
    floorPrice: 0.01,
    floorCurrency: "ETH",
    totalVolume: 8200,
    totalVolumeCurrency: "ETH",
    itemCount: 5000,
    ownerCount: 3100,
    listedPct: 6.8,
    chain: "ethereum",
    verified: true,
    creatorName: "DXTerminal",
    category: "art",
    change1d: -14.9,
    change7d: -22.1,
    createdAt: "2023-06-01T00:00:00Z",
  },
  {
    slug: "rektguy",
    name: "rektguy",
    description: "rektguy is a collection of 8,814 unique characters by OSF. No roadmap. No Discord. Just vibes.",
    imageUrl: collectionImage("rektguy", 150),
    bannerUrl: bannerImage(150),
    floorPrice: 0.2144,
    floorCurrency: "ETH",
    totalVolume: 40400,
    totalVolumeCurrency: "ETH",
    itemCount: 8814,
    ownerCount: 4200,
    listedPct: 2.4,
    chain: "ethereum",
    verified: true,
    creatorName: "rektsafe.eth",
    category: "pfps",
    change1d: 3.5,
    change7d: 8.1,
    createdAt: "2022-05-20T00:00:00Z",
  },
  {
    slug: "good-vibes-club",
    name: "Good Vibes Club",
    description: "Spreading good vibes across the blockchain, one NFT at a time.",
    imageUrl: collectionImage("Good Vibes", 90),
    bannerUrl: bannerImage(90),
    floorPrice: 0.92,
    floorCurrency: "ETH",
    totalVolume: 15600,
    totalVolumeCurrency: "ETH",
    itemCount: 6666,
    ownerCount: 2900,
    listedPct: 4.5,
    chain: "ethereum",
    verified: false,
    creatorName: "GoodVibes",
    category: "art",
    change1d: 2.1,
    change7d: -5.7,
    createdAt: "2023-01-10T00:00:00Z",
  },
];

// ---- NFT generation helpers ----

const ethAddresses = [
  "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
  "0xdeadbeef00000000000000000000000000000001",
  "0xc0ffee254729296a45a3885639ac7e10f9d54979",
  "0xbadc0de000000000000000000000000000000002",
  "0xfeed0000000000000000000000000000000face3",
  "0xace00000000000000000000000000000000ace04",
  "0xbabe0000000000000000000000000000000babe5",
  "0xdad00000000000000000000000000000000dad06",
];

const ownerNames = [
  "0xA1b2...c3D4",
  "0x9f8E...7d6C",
  "0x5a4B...3c2D",
  "vitalik.eth",
  "punk6529.eth",
  "pranksy.eth",
  "0xD1e2...f3A4",
  "cobie.eth",
];

function nftImage(collectionName: string, tokenId: string, hue: number): string {
  const h2 = (hue + parseInt(tokenId) * 37) % 360;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${h2},65%,35%)"/>
        <stop offset="100%" style="stop-color:hsl(${(h2 + 80) % 360},65%,25%)"/>
      </linearGradient></defs>
      <rect width="400" height="400" fill="url(#g)"/>
      <text x="200" y="180" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="60" font-family="monospace">#${tokenId}</text>
      <text x="200" y="250" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="16" font-family="sans-serif">${collectionName}</text>
    </svg>`
  )}`;
}

const traitTypes = ["Background", "Body", "Eyes", "Mouth", "Headwear", "Clothing", "Accessory"];
const traitValues: Record<string, string[]> = {
  Background: ["Blue", "Red", "Green", "Purple", "Gold", "Black", "White", "Orange"],
  Body: ["Default", "Gold", "Zombie", "Alien", "Robot", "Diamond", "Ape", "Dark"],
  Eyes: ["Normal", "Laser", "3D", "Closed", "Sunglasses", "Angry", "Wide", "Tired"],
  Mouth: ["Smile", "Frown", "Pipe", "Cigarette", "Grin", "Open", "Tongue", "Neutral"],
  Headwear: ["None", "Cap", "Beanie", "Crown", "Halo", "Bandana", "Hoodie", "Mohawk"],
  Clothing: ["None", "Hoodie", "Suit", "T-Shirt", "Armor", "Chain", "Toga", "Leather"],
  Accessory: ["None", "Chain", "Earring", "Watch", "Ring", "Monocle", "Scarf", "Medal"],
};

function generateActivity(tokenId: string, collectionSlug: string): Activity[] {
  const now = Date.now();
  const events: Activity[] = [];
  const numEvents = 3 + Math.floor(Math.abs(hashCode(collectionSlug + tokenId)) % 6);

  for (let i = 0; i < numEvents; i++) {
    const types: Activity["eventType"][] = ["sale", "transfer", "list", "offer", "mint"];
    const eventType = types[Math.abs(hashCode(collectionSlug + tokenId + i)) % types.length];
    events.push({
      id: `${collectionSlug}-${tokenId}-${i}`,
      eventType,
      price: eventType === "transfer" ? null : 0.1 + Math.abs(hashCode(collectionSlug + tokenId + i + "p")) % 100 / 10,
      currency: "ETH",
      fromAddress: ownerNames[Math.abs(hashCode(collectionSlug + tokenId + i + "f")) % ownerNames.length],
      toAddress: ownerNames[Math.abs(hashCode(collectionSlug + tokenId + i + "t")) % ownerNames.length],
      timestamp: now - (i + 1) * 86400000 * (1 + (Math.abs(hashCode(collectionSlug + tokenId + i + "d")) % 30)),
    });
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

function generateNFTs(collection: Collection, count: number): NFT[] {
  const nfts: NFT[] = [];
  const hue = Math.abs(hashCode(collection.slug)) % 360;

  for (let i = 0; i < count; i++) {
    const tokenId = String(1000 + i * 137 + Math.abs(hashCode(collection.slug + i)) % 100);
    const properties: NFT["properties"] = traitTypes.map((traitType) => {
      const vals = traitValues[traitType];
      const val = vals[Math.abs(hashCode(collection.slug + tokenId + traitType)) % vals.length];
      return {
        traitType,
        value: val,
        rarity: 5 + Math.abs(hashCode(collection.slug + tokenId + traitType + "r")) % 45,
      };
    });

    const isListed = Math.abs(hashCode(collection.slug + tokenId + "listed")) % 100 < collection.listedPct * 10;
    const currentPrice = isListed ? collection.floorPrice * (0.8 + Math.abs(hashCode(collection.slug + tokenId + "price")) % 400 / 100) : null;

    nfts.push({
      tokenId,
      collectionSlug: collection.slug,
      name: `${collection.name} #${tokenId}`,
      description: `A unique item from the ${collection.name} collection.`,
      imageUrl: nftImage(collection.name, tokenId, hue),
      owner: ownerNames[Math.abs(hashCode(collection.slug + tokenId + "owner")) % ownerNames.length],
      lastSalePrice: collection.floorPrice * (0.5 + Math.abs(hashCode(collection.slug + tokenId + "last")) % 300 / 100),
      lastSaleCurrency: collection.floorCurrency,
      currentPrice,
      currentCurrency: collection.floorCurrency,
      isListed,
      rarity: i + 1,
      properties,
      activityHistory: generateActivity(tokenId, collection.slug),
      chain: collection.chain,
      contractAddress: ethAddresses[Math.abs(hashCode(collection.slug)) % ethAddresses.length],
      tokenStandard: "ERC-721",
    });
  }
  return nfts;
}

// Generate NFTs for each collection
export const nftsByCollection: Record<string, NFT[]> = {};
for (const c of collections) {
  nftsByCollection[c.slug] = generateNFTs(c, 8);
}

// Flat list for quick lookup
export const allNFTs: NFT[] = Object.values(nftsByCollection).flat();
