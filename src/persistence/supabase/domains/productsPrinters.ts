// Gate S4 — products & printers domain mappings.
// Product, PrinterModel. (CustomerPrinter has no dedicated zod schema and is
// therefore deferred — the boundary validates only schema-backed entities.)
import type { PrinterModel, Product } from "@/domain/types";
import { printerModelSchema, productSchema } from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const productsPrintersMappings: AnyMapping[] = [
  defineMapping<Product>({
    collection: "products",
    table: "products",
    idPrefix: "pr",
    schema: productSchema,
    fields: fields({
      name: "name",
      category: "category",
      description: "description",
      price: "price",
      active: "active",
    }),
  }),
  defineMapping<PrinterModel>({
    collection: "printerModels",
    table: "printer_models",
    idPrefix: "pm",
    schema: printerModelSchema,
    fields: fields({
      name: "name",
      manufacturer: "manufacturer",
      technology: "technology",
      price: "price",
      tags: "tags",
      note: "note",
    }),
  }),
];
