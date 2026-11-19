import { requestJira } from "@forge/bridge";
import type {
  EdgeDefinition,
  ElementsDefinition,
  NodeDefinition,
} from "cytoscape";

interface IssueLink {
  type: {
    name: string;
  };
  inwardIssue?: {
    key: string;
  };
  outwardIssue?: {
    key: string;
  };
}

interface IssueStatus {
  name: string;
  statusCategory?: {
    colorName: string;
  };
}

interface Issue {
  key: string;
  fields: {
    status: IssueStatus;
    issuelinks: IssueLink[];
  };
}

interface ParsedLink {
  type: string;
  dir: "in" | "out";
  root: string;
  other: string;
}

export interface ParsedIssue {
  key: string;
  status: string;
  colour: string;
  flagged: boolean;
  isRoot: boolean;
}

const parseLink = (root: string, link: IssueLink): ParsedLink | undefined => {
  const other = link.inwardIssue
    ? link.inwardIssue.key
    : link.outwardIssue?.key;

  if (!other) {
    return undefined;
  }

  return {
    type: link.type.name,
    dir: link.inwardIssue ? "in" : "out",
    root: root,
    other,
  };
};

const isFlagged = (issue: Issue): boolean =>
  Object.entries(issue.fields).some(
    ([key, val]) =>
      key.includes("custom") && JSON.stringify(val).includes("Impediment"),
  );

const parseIssue = (issue: Issue, rootKey: string): ParsedIssue => ({
  key: issue.key,
  status: issue.fields.status.name,
  colour: issue.fields.status.statusCategory?.colorName ?? "",
  flagged: isFlagged(issue),
  isRoot: issue.key === rootKey,
});

const unknownIssue = (key: string): ParsedIssue => ({
  key,
  status: "",
  colour: "",
  flagged: false,
  isRoot: false,
});

const issueLinks = (issue: Issue): ParsedLink[] =>
  issue.fields.issuelinks
    .map((l) => parseLink(issue.key, l))
    .filter((l): l is ParsedLink => l !== undefined);

const toElements = (
  issues: ParsedIssue[],
  links: ParsedLink[],
): ElementsDefinition => {
  const outLinks = links.filter((l) => l.dir === "out");
  const known = new Set(issues.map((i) => i.key));
  const missing = [
    ...new Set(
      outLinks.flatMap((l) => [l.root, l.other]).filter((k) => !known.has(k)),
    ),
  ].map(unknownIssue);

  const nodes: NodeDefinition[] = [...issues, ...missing].map((i) => ({
    data: { id: i.key, ...i },
  }));

  const edges: EdgeDefinition[] = outLinks.map((l) => ({
    data: {
      id: `${l.root}_${l.type}_${l.other}`,
      source: l.root,
      target: l.other,
      label: l.type,
    },
  }));

  return { nodes, edges };
};

const getEpicIssues = async (epicKey: string): Promise<Issue[]> => {
  const epicResponse = await requestJira(`/rest/api/3/search/jql`, {
    body: JSON.stringify({
      fields: ["*navigable"],
      jql: `parentEpic = ${epicKey} OR parent = ${epicKey}`,
      maxResults: 100,
    }),
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const epic = await epicResponse.json();

  return epic.issues;
};

const getIssue = async (key: string): Promise<Issue | undefined> => {
  try {
    const response = await requestJira(`/rest/api/3/issue/${key}`);
    return response.ok ? await response.json() : undefined;
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

const issueIsEpic = async (key: string): Promise<boolean> => {
  const issueResponse = await requestJira(
    `/rest/api/3/issue/${key}?fields=issuetype`,
  );
  const issue = await issueResponse.json();
  return issue.fields.issuetype.name === "Epic";
};

const traverseIssues = async (rootKey: string): Promise<Issue[]> => {
  const visit = async (
    frontier: string[],
    seen: Map<string, Issue | undefined>,
  ): Promise<Issue[]> => {
    const next = [...new Set(frontier)].filter((k) => !seen.has(k));
    if (next.length === 0) {
      return [...seen.values()].filter((i): i is Issue => i !== undefined);
    }

    const fetched = await Promise.all(next.map(getIssue));
    const nextSeen = new Map([
      ...seen,
      ...next.map((k, idx) => [k, fetched[idx]] as const),
    ]);

    return visit(
      fetched.flatMap((i) => (i ? issueLinks(i).map((l) => l.other) : [])),
      nextSeen,
    );
  };

  return visit([rootKey], new Map());
};

export const makeGraph = async (
  rootKey: string,
): Promise<ElementsDefinition> => {
  const issues = (await issueIsEpic(rootKey))
    ? await getEpicIssues(rootKey)
    : await traverseIssues(rootKey);

  return toElements(
    issues.map((i) => parseIssue(i, rootKey)),
    issues.flatMap(issueLinks),
  );
};
