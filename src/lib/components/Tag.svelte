<script lang="ts">
  type Props = { label: string };
  let { label }: Props = $props();
</script>

<span class="bg-secondary rounded-lg px-2.5 py-0 text-sm text-white">
  {label}
</span>
