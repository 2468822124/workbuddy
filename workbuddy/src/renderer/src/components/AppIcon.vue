<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles, LayoutGrid, FolderKanban, Library, Dumbbell, Settings,
  Sun, Calendar, RefreshCw, Plus, CheckSquare, Newspaper, Inbox,
  CornerUpRight, Lightbulb, BookOpen, Check, Circle, ChevronLeft, ChevronRight,
  Loader, AlertCircle, Send, X,
  ClipboardList, NotebookPen, Bold, Italic, Heading, ListChecks, List, Link,
  Eye, EyeOff, Pencil, Trash2, Download, Upload,
  SkipForward, CalendarDays, MoveRight, Target, Repeat, CalendarRange,
  ChevronUp, ChevronDown, Info, CalendarCheck, Lock, Copy, ExternalLink } from 'lucide-vue-next'

const icons = {
  Sparkles, LayoutGrid, FolderKanban, Library, Dumbbell, Settings,
  Sun, Calendar, RefreshCw, Plus, CheckSquare, Newspaper, Inbox,
  CornerUpRight, Lightbulb, BookOpen, Check, Circle, ChevronLeft, ChevronRight,
  Loader, AlertCircle, Send, X,
  ClipboardList, NotebookPen, Bold, Italic, Heading, ListChecks, List, Link,
  Eye, EyeOff, Pencil, Trash2, Download, Upload,
  SkipForward, CalendarDays, MoveRight, Target, Repeat, CalendarRange,
  ChevronUp, ChevronDown, Info, CalendarCheck, Lock, Copy, ExternalLink,
}

const props = withDefaults(defineProps<{
  name: keyof typeof icons
  size?: number | string
  stroke?: number
}>(), {
  size: 18,
  stroke: 1.75,
})
</script>

<template>
  <component :is="icons[name]" :size="size" :stroke-width="stroke" />
</template>
