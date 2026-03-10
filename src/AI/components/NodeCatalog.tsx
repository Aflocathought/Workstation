import { For } from "solid-js";
import { getNodeCatalog } from "../workflow/node-registry";

interface NodeCatalogProps {
  onAddNode: (defType: string) => void;
}

const NodeCatalog = (props: NodeCatalogProps) => {
  const catalog = getNodeCatalog();
  return (
    <div class="wf-panel wf-panel--catalog">
      <strong>节点目录</strong>
      <For each={catalog}>
        {(group) => (
          <div class="wf-catalog-group">
            <div class="wf-catalog-group__title">
              {group.icon} {group.label}
            </div>
            <For each={group.nodes}>
              {(node) => (
                <div class="wf-catalog-item" onClick={() => props.onAddNode(node.type)}>
                  <span class="wf-catalog-item__icon">{node.icon}</span>
                  <div class="wf-catalog-item__info">
                    <span class="wf-catalog-item__name">{node.label}</span>
                    <span class="wf-catalog-item__desc">{node.description}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
};

export default NodeCatalog;
