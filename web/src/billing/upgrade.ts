// Opens /dashboard/upgrade from anywhere in the dashboard (locked Premium screens, quota notice);
// null while billing is off or there is nothing to buy, and the buttons fall back to "coming soon".
import { createContext, useContext } from 'react';

export const UpgradeContext = createContext<(() => void) | null>(null);
export const useUpgrade = () => useContext(UpgradeContext);
