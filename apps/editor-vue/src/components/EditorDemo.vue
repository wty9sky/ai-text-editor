<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { TiptapEditor, ContextMenuPlugin, BlockMenuPlugin } from '@ai-editor/editor';

const editorContainer = ref<HTMLElement | null>(null);
let editor: TiptapEditor | null = null;

onMounted(async () => {
  if (!editorContainer.value) return;

  editor = new TiptapEditor({
    container: editorContainer.value,
    content: '<p>Hello AiEditor! Try right-click or hover over blocks.</p><ul><li>Item 1</li><li>Item 2</li></ul>',
  });

  // 注册插件
  editor.use(new ContextMenuPlugin([
    { 
      label: 'Bold', 
      action: (e) => e.toggleBold() 
    },
    { 
      label: 'Italic', 
      action: (e) => e.toggleItalic() 
    },
    { 
      label: 'Clear Content', 
      action: (e) => e.clearContent() 
    }
  ]));

  editor.use(new BlockMenuPlugin());

  // 启动
  await editor.init();
});

onBeforeUnmount(() => {
  if (editor) {
    editor.destroy();
    editor = null;
  }
});
</script>

<template>
  <div class="editor-demo">
    <h2>AiEditor Demo</h2>
    <div ref="editorContainer" class="editor-container"></div>
  </div>
</template>

<style>
.editor-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.editor-container {
  border: 1px solid #ddd;
  border-radius: 8px;
  min-height: 400px;
  padding: 20px;
  background: white;
}

/* Tiptap styles */
.ProseMirror {
  outline: none;
}

.ProseMirror p {
  margin: 1em 0;
}

.ProseMirror ul, .ProseMirror ol {
  padding-left: 1.5em;
}
</style>
