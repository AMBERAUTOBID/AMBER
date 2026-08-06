/**
 * Apibara as an `AuctionSource`.
 *
 * Deliberately a thin binding and nothing more: the functions in ./client keep
 * their own signatures, their Next Data Cache behaviour and their measured
 * quirks untouched, so adopting the adapter is provably a no-op for the live
 * site. Anything that changes how Apibara behaves belongs in ./client, not here.
 */
import {
  getRelatedVehicles,
  getVehicleDetail,
  searchVehicles,
  searchVehiclesAcrossTypes,
} from "./client";
import type { AuctionSource } from "./source";

export const apibaraSource: AuctionSource = {
  name: "apibara",
  searchVehicles,
  searchVehiclesAcrossTypes,
  getVehicleDetail,
  getRelatedVehicles,
};
