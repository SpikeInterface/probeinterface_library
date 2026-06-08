import { useEffect, useState } from "react";

interface JsonTreeProps {
  data: unknown;
  name?: string;
  path?: string;
  depth?: number;
  defaultExpanded?: boolean;
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  return JSON.stringify(value);
}

export function JsonTree({
  data,
  name,
  path = "root",
  depth = 0,
  defaultExpanded = depth === 0,
}: JsonTreeProps) {
  const isArray = Array.isArray(data);
  const isPlainObject =
    data !== null &&
    typeof data === "object" &&
    !isArray;

  if (!isArray && !isPlainObject) {
    return (
      <div className="json-tree-item" data-depth={depth}>
        {name !== undefined && <span className="json-tree-key">{name}: </span>}
        <span className="json-tree-value json-tree-value--primitive">
          {formatPrimitive(data)}
        </span>
      </div>
    );
  }

  return (
    <JsonTreeBranch
      data={data}
      name={name}
      path={path}
      depth={depth}
      defaultExpanded={defaultExpanded}
    />
  );
}

interface JsonTreeBranchProps {
  data: unknown;
  name?: string;
  path: string;
  depth: number;
  defaultExpanded: boolean;
}

function JsonTreeBranch({
  data,
  name,
  path,
  depth,
  defaultExpanded,
}: JsonTreeBranchProps) {
  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((value, index) => ({
        key: String(index),
        value,
        label: `[${index}]`,
      }))
    : Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
        key,
        value,
        label: key,
      }));

  const summaryMeta = isArray
    ? `[${entries.length}]`
    : `{${entries.length}}`;

  const nodeName = name ?? (isArray ? "Array" : "Object");

  const [isOpen, setIsOpen] = useState(defaultExpanded);

  useEffect(() => {
    setIsOpen(defaultExpanded);
  }, [defaultExpanded, path]);

  return (
    <details
      className="json-tree-node"
      data-depth={depth}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="json-tree-key">{nodeName}</span>
        <span className="json-tree-meta">{summaryMeta}</span>
      </summary>
      <div className="json-tree-children">
        {entries.map((entry) => (
          <JsonTree
            key={`${path}.${entry.key}`}
            data={entry.value}
            name={entry.label}
            path={`${path}.${entry.key}`}
            depth={depth + 1}
          />
        ))}
      </div>
    </details>
  );
}
