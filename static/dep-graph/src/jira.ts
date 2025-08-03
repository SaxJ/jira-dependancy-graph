import { requestJira } from "@forge/bridge";
import type { EdgeDefinition, ElementsDefinition } from "cytoscape";

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

interface ParsedIssue {
  key: string;
  status: string;
  flagged: boolean;
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

const issueToLinks = (issue: Issue): EdgeDefinition[] => {
  const parentKey = issue.key;

  const linkObjects = issue.fields.issuelinks;
  const links: EdgeDefinition[] = [];

  for (const linkObject of linkObjects) {
    if (linkObject.inwardIssue || !linkObject.outwardIssue) {
      continue;
    }

    links.push({
      data: {
        id: `${parentKey}_${linkObject.outwardIssue.key}`,
        source: parentKey,
        target: linkObject.outwardIssue.key,
      },
    });
  }

  return links;
};

const compileGraphFromEpic = (issues: Issue[]): ElementsDefinition => {
  const elements: ElementsDefinition = {
    nodes: [],
    edges: [],
  };

  for (const issue of issues) {
    elements.nodes.push({ data: { id: issue.key } });
    const ls = issueToLinks(issue);
    for (const l of ls) {
      elements.edges.push(l);
    }
  }

  return elements;
};

const getEpicIssues = async (epicKey: string): Promise<Issue[]> => {
  const epicResponse = await requestJira(`/rest/api/3/search`, {
    body: `{"fields": ["key","issuelinks","status"], "jql": "parentEpic = ${epicKey} OR parent = ${epicKey}"}`,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const epic = await epicResponse.json();
  const issues = epic.issues;

  return issues;
};

const issueIsEpic = async (key: string): Promise<boolean> => {
  const issueResponse = await requestJira(
    `/rest/api/3/issue/${key}?fields=issuetype`,
  );
  const issue = await issueResponse.json();
  const typeName = issue.fields.issuetype.name;
  return typeName === "Epic";
};

const isFlagged = (issue: Issue): boolean => {
  const fields = issue.fields;

  return Object.entries(fields).some((entry) => {
    const [key, val] = entry;
    return key.includes("custom") && JSON.stringify(val).includes("Impediment");
  });
};

const traverseIssues = async (
  rootKey: string,
): Promise<{ allLinks: ParsedLink[]; allIssues: ParsedIssue[] }> => {
  const queue = [rootKey];
  const links = [];
  const seen: Record<
    string,
    { key: string; status: string; flagged: boolean }
  > = {};
  while (queue.length > 0) {
    let currentKey = queue.pop();
    if ((currentKey && currentKey in seen) || !currentKey) {
      continue;
    }

    let issueResponse = null;
    try {
      issueResponse = await requestJira(`/rest/api/3/issue/${currentKey}`);
    } catch (e) {
      console.log(e);
    }
    const issue: Issue | undefined = await issueResponse?.json();

    if (!issue) {
      continue;
    }

    const { issuelinks } = issue?.fields ?? {};

    seen[currentKey] = {
      key: currentKey,
      status: issue.fields.status.name,
      flagged: isFlagged(issue),
    };

    for (let l of issuelinks) {
      const parsed = parseLink(currentKey, l);
      if (!parsed) {
        continue;
      }

      links.push(parsed);
      queue.push(parsed.other);
    }
  }

  return {
    allLinks: links,
    allIssues: Object.values(seen),
  };
};

export const makeGraph = async (
  rootKey: string,
): Promise<ElementsDefinition> => {
  const isEpic = await issueIsEpic(rootKey);
  if (isEpic) {
    const issues = await getEpicIssues(rootKey);
    return compileGraphFromEpic(issues);
  }

  const traverseResult = await traverseIssues(rootKey);
  const { allLinks, allIssues } = traverseResult;

  return {
    edges: allLinks.map((l) => ({
      data: { id: `${l.root}_${l.other}`, source: l.root, target: l.other },
    })),
    nodes: allIssues.map((i) => ({ data: { id: i.key } })),
  };
};
