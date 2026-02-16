<script lang="ts">
  import { community } from "$lib/mock";
</script>

<header class="flex h-16 shrink-0 items-center justify-between px-8">
  <div class="flex items-center gap-2">
    <div
      class="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 font-bold text-white"
    >
      {community.name[0]}
    </div>
    <span class="text-[1.7rem] font-medium text-gray-900">{community.name}</span
    >
  </div>
  <button class="text-sm text-gray-500 hover:text-gray-900"
    >Create your own community</button
  >
</header>
