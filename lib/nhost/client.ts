import { createClient } from "@nhost/nhost-js";

export const nhost = createClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "mlimswxxskorovtgheqc",
  region: process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1",
});

export const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "mlimswxxskorovtgheqc"}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1"}.nhost.run/v1`;
export const graphqlWsUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_WS_URL || `wss://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "mlimswxxskorovtgheqc"}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1"}.nhost.run/v1/graphql`;
