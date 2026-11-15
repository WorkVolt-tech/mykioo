// Display-only catalog. Supabase validates every submitted quote against the database.
export const PACKAGE_PRICES_CAD={
 365:{1:70,2:140,3:180,4:230,5:280},
 730:{1:140,2:250,3:350,4:450,5:560}
};
export const priceCAD=(days,devices)=>PACKAGE_PRICES_CAD[days]?.[devices]??null;
export const PAYMENT_LABELS={interac:'Interac e-Transfer (CAD)',zelle:'Zelle (USD)',btc:'Bitcoin (BTC) — Bitcoin Mainnet',shib:'Shiba Inu (SHIB) — Ethereum ERC-20'};
