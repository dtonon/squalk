<script lang="ts">
  import { onMount } from "svelte";
  type PostLike = { createdAt: number };

  type Props = {
    posts: PostLike[];
    postEls: (HTMLElement | null)[];
    topOffset: number;
    visible?: boolean;
  };

  let {
    posts,
    postEls,
    topOffset,
    visible = $bindable(false),
  }: Props = $props();

  let scrollEl = $state<HTMLElement | null>(null);
  let trackEl = $state<HTMLElement | null>(null);

  let scrollTop = $state(0);
  let scrollHeight = $state(1);
  let clientHeight = $state(1);
  let trackHeight = $state(300);

  let isDragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  const isOverflowing = $derived(scrollHeight > clientHeight);
  $effect(() => {
    visible = isOverflowing;
  });
  const maxScroll = $derived(Math.max(scrollHeight - clientHeight, 1));
  const thumbHeight = $derived(
    Math.max((clientHeight / scrollHeight) * trackHeight, 28),
  );
  const thumbTop = $derived(
    (scrollTop / maxScroll) * (trackHeight - thumbHeight),
  );

  const currentPostIndex = $derived.by(() => {
    if (!scrollEl || !postEls.length) return 0;
    const mid = scrollTop + clientHeight / 2;
    let idx = 0;
    for (let i = 0; i < postEls.length; i++) {
      const el = postEls[i];
      if (!el) continue;
      const mainTop = scrollEl.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top - mainTop + scrollTop;
      if (elTop <= mid) idx = i;
      else break;
    }
    return idx;
  });

  const currentDate = $derived(
    posts[currentPostIndex]
      ? formatShortDate(posts[currentPostIndex].createdAt)
      : "",
  );

  function formatShortDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function formatDate(ts: number) {
    const date = new Date(ts * 1000);
    const monthDay = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const year = date.toLocaleDateString("en-US", { year: "numeric" });
    return `${monthDay}\n${year}`;
  }

  function update() {
    if (!scrollEl) return;
    scrollTop = scrollEl.scrollTop;
    scrollHeight = scrollEl.scrollHeight;
    clientHeight = scrollEl.clientHeight;
  }

  onMount(() => {
    scrollEl = document.querySelector("main");
    if (!scrollEl) return;
    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    return () => {
      scrollEl!.removeEventListener("scroll", update);
      ro.disconnect();
    };
  });

  $effect(() => {
    if (!trackEl) return;
    const ro = new ResizeObserver(() => {
      trackHeight = trackEl!.clientHeight;
    });
    ro.observe(trackEl);
    trackHeight = trackEl.clientHeight;
    return () => ro.disconnect();
  });

  function onThumbPointerDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartY = e.clientY;
    dragStartScrollTop = scrollTop;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onThumbPointerMove(e: PointerEvent) {
    if (!isDragging || !scrollEl) return;
    const dy = e.clientY - dragStartY;
    const ratio = dy / (trackHeight - thumbHeight);
    scrollEl.scrollTop = dragStartScrollTop + ratio * maxScroll;
  }

  function onThumbPointerUp() {
    isDragging = false;
  }

  function onTrackClick(e: MouseEvent) {
    if (!scrollEl || !trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const y = e.clientY - rect.top - thumbHeight / 2;
    const ratio = Math.max(0, Math.min(1, y / (trackHeight - thumbHeight)));
    scrollEl.scrollTop = ratio * maxScroll;
  }

  const firstPost = $derived(posts[0]);
  const lastPost = $derived(posts[posts.length - 1]);
</script>

<div
  class="sticky self-start flex-shrink-0 flex flex-col items-end select-none pt-1"
  style="top: calc({topOffset}px - 1.5rem); height: 50vh; width: 72px; display: {isOverflowing
    ? 'flex'
    : 'none'};"
  aria-hidden="true"
>
  <!-- First post date -->
  <div
    class="text-xs text-gray-300 mb-1 text-right leading-tight whitespace-pre"
  >
    {firstPost ? formatDate(firstPost.createdAt) : ""}
  </div>

  <!-- Track area -->
  <div
    bind:this={trackEl}
    class="relative flex-1 w-full cursor-pointer"
    onclick={onTrackClick}
    role="presentation"
  >
    <!-- Track line -->
    <div
      class="absolute top-0 bottom-0 rounded-full bg-brand"
      style="width: 2px; right: 4px;"
    ></div>

    <!-- Thumb -->
    <div
      class="absolute rounded-full bg-brand hover:bg-gray-800 transition-colors cursor-grab active:cursor-grabbing touch-none"
      style="width: 4px; right: 3px; top: {thumbTop}px; height: {thumbHeight}px;"
      onpointerdown={onThumbPointerDown}
      onpointermove={onThumbPointerMove}
      onpointerup={onThumbPointerUp}
      onpointercancel={onThumbPointerUp}
      role="presentation"
    ></div>

    <!-- Current date label -->
    <div
      class="absolute text-xs text-brand whitespace-nowrap pointer-events-none leading-tight"
      style="right: 18px; top: {thumbTop +
        thumbHeight / 2}px; transform: translateY(-50%);"
    >
      {currentDate}
    </div>
  </div>

  <!-- Last post date -->
  <div
    class="text-xs text-gray-300 mt-1 text-right leading-tight whitespace-pre"
  >
    {lastPost ? formatDate(lastPost.createdAt) : ""}
  </div>
</div>
