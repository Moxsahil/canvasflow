import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  useSidebar,
} from '@/components/ui/sidebar';

interface MenuSectionProps {
  label: string;
  /** Sits in the icon column, and is all that shows when the sidebar collapses. */
  icon: ReactNode;
  tooltip?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A named row that expands to its own items — the sidebar's one grouping
 * device, used for every group of actions and for the appearance controls.
 *
 * The Collapsible sits inside the item rather than replacing it: `asChild` on a
 * component that doesn't forward a ref would drop it, and a div nests in an
 * `<li>` perfectly well.
 *
 * Sub-items are hidden while the sidebar is collapsed, so a click there expands
 * the sidebar first — otherwise the icon would toggle something invisible.
 */
export function MenuSection({ label, icon, tooltip, defaultOpen, children }: MenuSectionProps) {
  const { state, setOpen } = useSidebar();

  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
        <SidebarMenuButton asChild tooltip={tooltip ?? label}>
          <CollapsibleTrigger onClick={() => state === 'collapsed' && setOpen(true)}>
            {icon}
            <span>{label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
