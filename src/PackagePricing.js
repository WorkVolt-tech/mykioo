// Display-only catalog. Supabase validates every submitted quote against the database.
export const PACKAGE_PRICES_CAD={
 365:{1:80,2:150,3:190,4:240,5:290},
 730:{1:150,2:260,3:360,4:460,5:570}
};
export const priceCAD=(days,devices)=>PACKAGE_PRICES_CAD[days]?.[devices]??null;
export const PAYMENT_LABELS={interac:'Interac e-Transfer (CAD)',zelle:'Zelle (USD)',btc:'Bitcoin (BTC) — Bitcoin Mainnet',shib:'Shiba Inu (SHIB) — Ethereum ERC-20'};
