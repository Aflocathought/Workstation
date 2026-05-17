import { ChatBridgeProvider } from './ChatBridgeContext';
import ChatSidebar from './ChatSidebar';
import DictionaryView from './DictionaryView';
import './dict.css';

function DictTool() {
  return (
    <ChatBridgeProvider>
      <div class="dict-plugin-root relative h-full overflow-hidden text-slate-800">
        <div class="flex h-full min-h-0 flex-col gap-1 p-5 xl:flex-row xl:p-6">
          <section class="min-h-0 min-w-0 flex-1">
            <DictionaryView />
          </section>

          <aside class="min-h-[400px] w-full xl:min-h-0 xl:w-[380px] xl:shrink-0">
            <ChatSidebar />
          </aside>
        </div>
      </div>
    </ChatBridgeProvider>
  );
}

export default DictTool;