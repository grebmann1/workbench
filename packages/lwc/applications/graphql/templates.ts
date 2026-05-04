/**
 * Curated catalog of canonical Salesforce GraphQL queries.
 *
 * These target the Salesforce GraphQL endpoint exposed at
 *   /services/data/v64.0/graphql
 *
 * and use the `uiapi` root (query / aggregate / mutate) — see
 *   https://developer.salesforce.com/docs/platform/graphql/guide/
 *
 * Each template is a working query / mutation that a user can paste into the
 * GraphQL Explorer and run against an authenticated Salesforce org. Variables
 * are stored as a JSON string to match the shape used by the existing API
 * Explorer catalog (see `api/catalogPanel`).
 */

const LEAF_ICON = 'lucide:file-code';
const FOLDER_ICON_ROOT = 'lucide:layers';
const FOLDER_ICON_RECORDS = 'lucide:database';
const FOLDER_ICON_PAGINATION = 'lucide:list';
const FOLDER_ICON_AGGREGATES = 'lucide:sigma';
const FOLDER_ICON_MUTATIONS = 'lucide:pencil';
const FOLDER_ICON_ADVANCED = 'lucide:sparkles';

export const SALESFORCE_GRAPHQL_TEMPLATES = {
    id: 'gql-catalog:root',
    name: 'Salesforce GraphQL',
    icon: FOLDER_ICON_ROOT,
    children: [
        {
            id: 'gql-catalog:records',
            name: 'Records',
            icon: FOLDER_ICON_RECORDS,
            children: [
                {
                    id: 'gql-catalog:records:list',
                    name: 'List records',
                    title: 'List Account records with Id and Name',
                    icon: LEAF_ICON,
                    body: `query ListAccounts {
  uiapi {
    query {
      Account(first: 10) {
        edges {
          node {
            Id
            Name {
              value
            }
          }
        }
      }
    }
  }
}
`,
                },
                {
                    id: 'gql-catalog:records:filter-where',
                    name: 'Filter (where)',
                    title: 'Filter Accounts where Industry equals a value',
                    icon: LEAF_ICON,
                    body: `query FilterAccountsByIndustry($industry: String = "Technology") {
  uiapi {
    query {
      Account(where: { Industry: { eq: $industry } }, first: 25) {
        edges {
          node {
            Id
            Name {
              value
            }
            Industry {
              value
            }
          }
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify({ industry: 'Technology' }, null, 2),
                },
                {
                    id: 'gql-catalog:records:sort-order-by',
                    name: 'Sort (orderBy)',
                    title: 'List Accounts sorted by CreatedDate descending',
                    icon: LEAF_ICON,
                    body: `query AccountsSortedByCreatedDate {
  uiapi {
    query {
      Account(orderBy: { CreatedDate: { order: DESC } }, first: 10) {
        edges {
          node {
            Id
            Name {
              value
            }
            CreatedDate {
              value
            }
          }
        }
      }
    }
  }
}
`,
                },
                {
                    id: 'gql-catalog:records:get-by-id',
                    name: 'Get by Id',
                    title: 'Fetch a single Account by Id',
                    icon: LEAF_ICON,
                    body: `query GetAccountById($accountId: ID = "001000000000000AAA") {
  uiapi {
    query {
      Account(where: { Id: { eq: $accountId } }, first: 1) {
        edges {
          node {
            Id
            Name {
              value
            }
            Industry {
              value
            }
            AnnualRevenue {
              value
            }
          }
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify({ accountId: '001000000000000AAA' }, null, 2),
                },
                {
                    id: 'gql-catalog:records:relationship-parent',
                    name: 'Relationship (parent)',
                    title: 'Traverse a parent relationship (Contact -> Account)',
                    icon: LEAF_ICON,
                    body: `query ContactsWithAccount {
  uiapi {
    query {
      Contact(first: 10) {
        edges {
          node {
            Id
            Name {
              value
            }
            Email {
              value
            }
            Account {
              Id
              Name {
                value
              }
            }
          }
        }
      }
    }
  }
}
`,
                },
                {
                    id: 'gql-catalog:records:relationship-children',
                    name: 'Child relationship',
                    title: 'Traverse a child relationship (Account -> Contacts)',
                    icon: LEAF_ICON,
                    body: `query AccountWithContacts {
  uiapi {
    query {
      Account(first: 5) {
        edges {
          node {
            Id
            Name {
              value
            }
            Contacts(first: 5) {
              edges {
                node {
                  Id
                  Name {
                    value
                  }
                  Email {
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`,
                },
            ],
        },
        {
            id: 'gql-catalog:pagination',
            name: 'Pagination',
            icon: FOLDER_ICON_PAGINATION,
            children: [
                {
                    id: 'gql-catalog:pagination:cursor-first',
                    name: 'Cursor (first + pageInfo)',
                    title: 'Cursor-based pagination with first + pageInfo',
                    icon: LEAF_ICON,
                    body: `query AccountsFirstPage($pageSize: Int = 25) {
  uiapi {
    query {
      Account(first: $pageSize) {
        edges {
          node {
            Id
            Name {
              value
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
      }
    }
  }
}
`,
                    variables: JSON.stringify({ pageSize: 25 }, null, 2),
                },
                {
                    id: 'gql-catalog:pagination:cursor-after',
                    name: 'Continuation (after)',
                    title: 'Fetch the next page using an `after` cursor',
                    icon: LEAF_ICON,
                    body: `query AccountsNextPage($pageSize: Int = 25, $after: String!) {
  uiapi {
    query {
      Account(first: $pageSize, after: $after) {
        edges {
          node {
            Id
            Name {
              value
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify(
                        { pageSize: 25, after: 'PASTE_endCursor_HERE' },
                        null,
                        2
                    ),
                },
            ],
        },
        {
            id: 'gql-catalog:aggregates',
            name: 'Aggregates',
            icon: FOLDER_ICON_AGGREGATES,
            children: [
                {
                    id: 'gql-catalog:aggregates:count',
                    name: 'Count',
                    title: 'Count all Account records',
                    icon: LEAF_ICON,
                    body: `query CountAccounts {
  uiapi {
    aggregate {
      Account {
        edges {
          node {
            aggregate {
              Id {
                count
              }
            }
          }
        }
      }
    }
  }
}
`,
                },
                {
                    id: 'gql-catalog:aggregates:group-by',
                    name: 'Group by field',
                    title: 'Group Accounts by Industry and count each group',
                    icon: LEAF_ICON,
                    body: `query AccountsGroupedByIndustry {
  uiapi {
    aggregate {
      Account(groupBy: { Industry: true }) {
        edges {
          node {
            grouping {
              Industry {
                value
              }
            }
            aggregate {
              Id {
                count
              }
            }
          }
        }
      }
    }
  }
}
`,
                },
            ],
        },
        {
            id: 'gql-catalog:mutations',
            name: 'Mutations',
            icon: FOLDER_ICON_MUTATIONS,
            children: [
                {
                    id: 'gql-catalog:mutations:create',
                    name: 'Create record',
                    title: 'Create a new Account via uiapi.mutate',
                    icon: LEAF_ICON,
                    body: `mutation CreateAccount($name: String!, $industry: String) {
  uiapi {
    AccountCreate(input: { Account: { Name: $name, Industry: $industry } }) {
      Record {
        Id
        Name {
          value
        }
        Industry {
          value
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify(
                        { name: 'Acme Corp', industry: 'Technology' },
                        null,
                        2
                    ),
                },
                {
                    id: 'gql-catalog:mutations:update',
                    name: 'Update record',
                    title: 'Update an existing Account via uiapi.mutate',
                    icon: LEAF_ICON,
                    body: `mutation UpdateAccount($accountId: ID!, $name: String!) {
  uiapi {
    AccountUpdate(input: { Id: $accountId, Account: { Name: $name } }) {
      Record {
        Id
        Name {
          value
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify(
                        { accountId: '001000000000000AAA', name: 'Acme Corp (renamed)' },
                        null,
                        2
                    ),
                },
                {
                    id: 'gql-catalog:mutations:delete',
                    name: 'Delete record',
                    title: 'Delete an Account by Id via uiapi.mutate',
                    icon: LEAF_ICON,
                    body: `mutation DeleteAccount($accountId: ID!) {
  uiapi {
    AccountDelete(input: { Id: $accountId }) {
      Record {
        Id
      }
    }
  }
}
`,
                    variables: JSON.stringify({ accountId: '001000000000000AAA' }, null, 2),
                },
            ],
        },
        {
            id: 'gql-catalog:advanced',
            name: 'Advanced',
            icon: FOLDER_ICON_ADVANCED,
            children: [
                {
                    id: 'gql-catalog:advanced:introspection',
                    name: 'Introspection (__schema)',
                    title: 'Introspect the GraphQL schema: list all type names',
                    icon: LEAF_ICON,
                    body: `query IntrospectSchema {
  __schema {
    queryType {
      name
    }
    mutationType {
      name
    }
    types {
      name
      kind
    }
  }
}
`,
                },
                {
                    id: 'gql-catalog:advanced:include-directive',
                    name: 'Variables + @include',
                    title: 'Use variables and the @include directive to toggle fields',
                    icon: LEAF_ICON,
                    body: `query AccountsWithOptionalIndustry($includeIndustry: Boolean = true) {
  uiapi {
    query {
      Account(first: 10) {
        edges {
          node {
            Id
            Name {
              value
            }
            Industry @include(if: $includeIndustry) {
              value
            }
          }
        }
      }
    }
  }
}
`,
                    variables: JSON.stringify({ includeIndustry: true }, null, 2),
                },
            ],
        },
    ],
};
