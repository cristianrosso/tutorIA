import "server-only";

import type { AcademicProduct } from "@/lib/products/products";
import { DEFAULT_PRODUCT_SLUG, listProductsForUser, productSlugSchema } from "@/lib/products/products";
import type { Profile } from "@/lib/models";

export type StudentProductContext = {
  products: AcademicProduct[];
  activeProduct: AcademicProduct;
  productParam: string;
};

export async function getStudentProductContext(
  profile: Profile,
  requestedSlug?: string | null,
): Promise<StudentProductContext> {
  const products = await listProductsForUser(profile);
  const fallback = products[0];
  const cleanSlug = requestedSlug
    ? productSlugSchema.catch(fallback?.slug || DEFAULT_PRODUCT_SLUG).parse(requestedSlug)
    : fallback?.slug || DEFAULT_PRODUCT_SLUG;
  const activeProduct =
    products.find((product) => product.slug === cleanSlug) ||
    fallback ||
    products[0];
  return {
    products,
    activeProduct,
    productParam: activeProduct.slug,
  };
}

export function withProduct(path: string, product: AcademicProduct | string) {
  const slug = typeof product === "string" ? product : product.slug;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}product=${encodeURIComponent(slug)}`;
}
