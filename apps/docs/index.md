---
layout: home
pageClass: home-page
---

<!-- ============ Hero ============ -->
<div class="arc-hero">
  <div class="arc-hero-inner">
    <div class="arc-hero-left">
      <h1 class="arc-slogan">
        图文编辑器<br>
        <span class="arc-slogan-grad">以块为基座的内容创作</span>
      </h1>
      <p class="arc-desc">文本、图片、视频、代码、附件——一切内容皆「块」。一套框架无关 SDK + 插件体系，支撑文档、图文、图片、无限画布四种编辑器形态，Vue 3 / React 双端复用。</p>
      <div class="arc-actions">
        <a class="arc-btn arc-btn-primary" href="/vue/getting-started">开始使用</a>
        <a class="arc-btn arc-btn-ghost" href="/playground">在线试玩</a>
      </div>
    </div>
    <div class="arc-hero-right">
      <img class="arc-hero-img" src="/hero.svg" alt="图文编辑器预览">
    </div>
  </div>
  <div class="arc-trust">
    <div class="arc-trust-item"><strong>3</strong><span>类编辑能力</span></div>
    <div class="arc-trust-item"><strong>6</strong><span>个扩展点</span></div>
    <div class="arc-trust-item"><strong>2</strong><span>端组件（Vue / React）</span></div>
    <div class="arc-trust-item"><strong>1</strong><span>套框架无关 SDK</span></div>
  </div>
</div>

<!-- ============ 快速上手 ============ -->
<section class="arc-sec">
  <header class="arc-sec-header">
    <div class="arc-sec-sub">快速上手</div>
    <h2 class="arc-sec-title">完善的设计开发资源</h2>
  </header>
  <div class="arc-resources">
    <div class="arc-resource">
      <div class="arc-resource-head">
        <div class="arc-resource-title">组件接入</div>
        <div class="arc-resource-desc">组件层封装，v-model / onChange 直接绑定 Markdown</div>
      </div>
      <div class="arc-resource-list">
        <a class="arc-resource-item" href="/vue/getting-started">
          <span class="arc-resource-dot"></span>Vue 3 组件
        </a>
        <a class="arc-resource-item" href="/react/getting-started">
          <span class="arc-resource-dot"></span>React 组件
        </a>
        <a class="arc-resource-item" href="/playground">
          <span class="arc-resource-dot"></span>在线试玩
        </a>
      </div>
    </div>
    <div class="arc-resource">
      <div class="arc-resource-head">
        <div class="arc-resource-title">核心 SDK</div>
        <div class="arc-resource-desc">框架无关的数据模型、引擎与插件体系</div>
      </div>
      <div class="arc-resource-list">
        <a class="arc-resource-item" href="/sdk/">
          <span class="arc-resource-dot"></span>SDK 概述
        </a>
        <a class="arc-resource-item" href="/sdk/editor">
          <span class="arc-resource-dot"></span>Editor 引擎
        </a>
        <a class="arc-resource-item" href="/sdk/plugin">
          <span class="arc-resource-dot"></span>插件体系
        </a>
        <a class="arc-resource-item" href="/sdk/upload">
          <span class="arc-resource-dot"></span>上传
        </a>
      </div>
    </div>
  </div>
</section>

<!-- ============ 核心特性 ============ -->
<section class="arc-sec">
  <header class="arc-sec-header">
    <div class="arc-sec-sub">设计原则</div>
    <h2 class="arc-sec-title">四个关键词，一套内核</h2>
  </header>
  <div class="arc-features">
    <div class="arc-feature">
      <div class="arc-feature-en">block</div>
      <div class="arc-feature-title">块为基座</div>
      <div class="arc-feature-desc">最小内容单元是「块」，结构即数据，操作以块为单位。</div>
    </div>
    <div class="arc-feature">
      <div class="arc-feature-en">plugin</div>
      <div class="arc-feature-title">插件化</div>
      <div class="arc-feature-desc">块类型 / 工具栏 / 右键 / 导出 / 上传 / AI，能力全部插件化。</div>
    </div>
    <div class="arc-feature">
      <div class="arc-feature-en">markdown</div>
      <div class="arc-feature-title">双向转换</div>
      <div class="arc-feature-desc">块 ↔ Markdown 无缝互转，受控 value / onChange 直接绑定字符串。</div>
    </div>
    <div class="arc-feature">
      <div class="arc-feature-en">multi</div>
      <div class="arc-feature-title">多端复用</div>
      <div class="arc-feature-desc">框架无关 SDK + Vue 3 / React 组件，写一次插件，两端生效。</div>
    </div>
  </div>
</section>

<!-- ============ 四种编辑器形态 ============ -->
<section class="arc-sec">
  <header class="arc-sec-header">
    <div class="arc-sec-sub">编辑器形态</div>
    <h2 class="arc-sec-title">文档组件与图片、画布 SDK</h2>
  </header>
  <div class="arc-editors">
    <a class="arc-editor arc-editor--active" href="/vue/getting-started">
      <img class="arc-editor-img" src="/editor-doc.svg" alt="文档编辑器">
      <div class="arc-editor-body">
        <div class="arc-editor-name">文档编辑器</div>
        <div class="arc-editor-desc">块式图文编辑、Markdown 转换与插件扩展。</div>
        <span class="arc-editor-status arc-editor-status--ready">Vue / React</span>
      </div>
    </a>
    <a class="arc-editor" href="/editors/image">
      <img class="arc-editor-img" src="/editor-image.svg" alt="图片编辑器">
      <div class="arc-editor-body">
        <div class="arc-editor-name">图片编辑器</div>
        <div class="arc-editor-desc">图层管理、裁剪、Canvas2D 渲染与导出。</div>
        <span class="arc-editor-status arc-editor-status--ready">核心 SDK</span>
      </div>
    </a>
    <a class="arc-editor" href="/editors/canvas">
      <img class="arc-editor-img" src="/editor-canvas.svg" alt="无限画布编辑器">
      <div class="arc-editor-body">
        <div class="arc-editor-name">无限画布编辑器</div>
        <div class="arc-editor-desc">节点、连线、视口与 DAG 工作流执行。</div>
        <span class="arc-editor-status arc-editor-status--ready">核心 SDK</span>
      </div>
    </a>
  </div>
</section>

<!-- ============ 结尾 CTA ============ -->
<section class="arc-sec arc-cta">
  <h2 class="arc-cta-title">和众多产品一起创造价值</h2>
  <p class="arc-cta-sub">框架无关的 SDK 核心，Vue 3 / React 双端组件，写一次插件，两端生效。</p>
  <div class="arc-cta-stats">
    <div class="arc-cta-stat"><strong>3</strong><span>类编辑能力</span></div>
    <div class="arc-cta-stat"><strong>6</strong><span>个扩展点</span></div>
    <div class="arc-cta-stat"><strong>2</strong><span>端组件</span></div>
  </div>
  <div class="arc-actions">
    <a class="arc-btn arc-btn-primary" href="/sdk/">阅读 SDK 文档</a>
    <a class="arc-btn arc-btn-ghost" href="/vue/getting-started">快速开始</a>
  </div>
</section>
