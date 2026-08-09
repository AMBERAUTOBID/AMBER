/**
 * Public entry for the inventory MODEL. Import from
 * `@/modules/inventory/model` rather than reaching into ./lotNormalize
 * directly — per ARCHITECTURE.md §1, a module is consumed through its entry
 * point.
 *
 * Deliberately narrow. `export *` across this folder would publish the ingest
 * internals (`apicarsLot`, `mirrorLot`) and the search query builder, none of
 * which another module has any business calling — they are shaped around one
 * vendor's payload and one page's URL, and exporting them invites exactly the
 * coupling this file exists to control.
 *
 * What is here is the part that encodes a fact about vehicles rather than
 * about a vendor: how the auctions' inconsistent strings fold into the classes
 * the business uses, and how an odometer is displayed. Those are as true in a
 * case file as they are in search, and a second copy of the title mapping is
 * the last thing this codebase needs — the six title buckets were decided with
 * the owner, and `rebuildable` staying separate from `salvage` changes what a
 * client may legally do with the car after import.
 */
export * from "./lotNormalize";
export * from "./formatOdometer";
