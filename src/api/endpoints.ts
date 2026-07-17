// Productboard API v2 endpoint reference.
//
// The v1 REST API was fully retired (every v1 path now returns HTTP 410 Gone).
// All resources are served under /v2. Note the shape change: features, products,
// components, subfeatures, objectives, initiatives, key results, releases, release
// groups, companies and users are NOT separate endpoints in v2 — they are all
// "entities" served by /v2/entities, selected via the `type[]` query parameter
// (e.g. `type[]=feature`, `type[]=objective`). Only notes, members, teams,
// webhooks and integrations have dedicated paths.
//
// This map is a documentation/reference aid; the tools hardcode their own v2 paths.
export const ENTITY_TYPES = [
  'product',
  'component',
  'feature',
  'subfeature',
  'initiative',
  'objective',
  'keyResult',
  'release',
  'releaseGroup',
  'user',
  'company',
] as const;

export const ENDPOINTS = {
  // Hierarchy entities (features, products, components, objectives, initiatives,
  // keyResults, releases, releaseGroups, companies, users). Filter by type[]=<type>.
  entities: {
    list: '/v2/entities', // ?type[]=<type>&fields[]=all — cursor pagination via links.next
    get: '/v2/entities/:id', // ?fields[]=all
    create: '/v2/entities',
    update: '/v2/entities/:id', // PATCH (PUT is 404)
    delete: '/v2/entities/:id',
    search: '/v2/entities/search', // POST { data: { filter: { type, fields }, return: { fields } } }
    relationships: '/v2/entities/:id/relationships',
    relationship: '/v2/entities/:id/relationships/:targetId',
    configurations: '/v2/entities/configurations', // custom field / status definitions
    fieldValues: '/v2/entities/fields/:id/values', // select-field option values
  },
  notes: {
    list: '/v2/notes', // created_from / created_to (date_to is exclusive), cursor pagination
    get: '/v2/notes/:id',
    create: '/v2/notes',
    update: '/v2/notes/:id', // PATCH
    delete: '/v2/notes/:id',
    attachToFeature: '/v2/notes/:id/relationships',
    detachFromFeature: '/v2/notes/:id/relationships/:featureId',
  },
  // Productboard makers/users (the old v1 /users resource).
  members: {
    list: '/v2/members',
    get: '/v2/members/:id',
    search: '/v2/members/search',
    activities: '/v2/members/:id/activities',
  },
  teams: {
    list: '/v2/teams',
    get: '/v2/teams/:id',
    create: '/v2/teams',
    update: '/v2/teams/:id',
    delete: '/v2/teams/:id',
    search: '/v2/teams/search',
    members: '/v2/teams/:id/members',
  },
  webhooks: {
    // v2 webhooks are immutable: no update or test endpoint exists.
    list: '/v2/webhooks',
    get: '/v2/webhooks/:id',
    create: '/v2/webhooks',
    delete: '/v2/webhooks/:id',
  },
  // Jira integration is READ-ONLY in v2 (no export/sync write endpoint).
  jiraIntegrations: {
    list: '/v2/jira-integrations',
    get: '/v2/jira-integrations/:id',
    connections: '/v2/jira-integrations/:id/connections',
    connection: '/v2/jira-integrations/:id/connections/:connectionId',
  },
  pluginIntegrations: {
    list: '/v2/plugin-integrations',
    get: '/v2/plugin-integrations/:id',
    create: '/v2/plugin-integrations',
    update: '/v2/plugin-integrations/:id',
    delete: '/v2/plugin-integrations/:id',
    connections: '/v2/plugin-integrations/:id/connections',
    connection: '/v2/plugin-integrations/:id/connections/:connectionId',
  },
} as const;

export type EndpointPaths = typeof ENDPOINTS;

export function buildEndpoint(template: string, params?: Record<string, string>): string {
  let endpoint = template;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      endpoint = endpoint.replace(`:${key}`, encodeURIComponent(value));
    });
  }
  return endpoint;
}

export function extractPathParams(template: string): string[] {
  const matches = template.match(/:(\w+)/g);
  return matches ? matches.map((match) => match.substring(1)) : [];
}