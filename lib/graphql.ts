import { graphqlUrl, nhost } from "./nhost/client";

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = nhost.getUserSession()?.accessToken;
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || json.errors?.length) throw new Error(json.errors?.map((e) => e.message).join("; ") || `GraphQL HTTP ${response.status}`);
  return json.data as T;
}
