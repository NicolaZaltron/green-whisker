// Facade: the data layer is split by table group (connection, webStorage, favoritesDb, shoppingDb,
// plannerDb, settingsDb, recipeCatalogDb). Importers keep using this module.
export * from './connection';
export * from './webStorage';
export * from './favoritesDb';
export * from './shoppingDb';
export * from './plannerDb';
export * from './settingsDb';
export * from './recipeCatalogDb';
