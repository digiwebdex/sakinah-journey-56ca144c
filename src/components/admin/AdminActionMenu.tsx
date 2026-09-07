import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive" | "success" | "warning" | "purple";
  hidden?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface AdminActionMenuProps {
  actions: ActionItem[];
  /** Show inline buttons for first N actions on desktop */
  inlineCount?: number;
  /**
   * Labels to surface as visible buttons, in this order — e.g. ["View", "Edit", "Delete"].
   * Matched on the start of the label so "View Details" answers to "View".
   * Takes precedence over inlineCount, which can only take actions positionally
   * and would otherwise promote whatever happens to sit first in the array.
   */
  primary?: string[];
}

const variantClasses: Record<string, string> = {
  default: "text-foreground hover:text-foreground",
  destructive: "text-destructive hover:text-destructive focus:text-destructive",
  success: "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-600 hover:text-amber-700 dark:text-amber-400",
  purple: "text-violet-600 hover:text-violet-700 dark:text-violet-400",
};

const inlineVariantClasses: Record<string, string> = {
  default: "text-muted-foreground hover:text-foreground hover:bg-secondary",
  destructive: "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
  success: "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10",
  warning: "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10",
  purple: "text-muted-foreground hover:text-violet-600 hover:bg-violet-500/10",
};

export default function AdminActionMenu({ actions, inlineCount = 0, primary }: AdminActionMenuProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  let inlineActions: ActionItem[];
  let menuActions: ActionItem[];

  if (primary && primary.length > 0) {
    const taken = new Set<ActionItem>();
    inlineActions = [];
    primary.forEach((label) => {
      const match = visible.find(
        (a) => !taken.has(a) && a.label.toLowerCase().startsWith(label.toLowerCase())
      );
      if (match) {
        taken.add(match);
        inlineActions.push(match);
      }
    });
    menuActions = visible.filter((a) => !taken.has(a));
  } else {
    inlineActions = visible.slice(0, inlineCount);
    menuActions = visible.slice(inlineCount);
  }

  return (
    <div className="flex items-center gap-1">
      {/* Inline buttons (hidden on mobile) */}
      {inlineActions.map((action, i) => (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); action.onClick(); }}
          disabled={action.disabled}
          title={action.label}
          className={`hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md transition-colors disabled:opacity-50 ${inlineVariantClasses[action.variant || "default"]}`}
        >
          {action.icon}
          <span className="hidden lg:inline">{action.label}</span>
        </button>
      ))}

      {/* Dropdown for remaining + mobile fallback */}
      {menuActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {/* On mobile, show inline actions in dropdown too */}
            {inlineActions.length > 0 && (
              <>
                {inlineActions.map((action, i) => (
                  <DropdownMenuItem
                    key={`inline-${i}`}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`sm:hidden gap-2 text-xs ${variantClasses[action.variant || "default"]}`}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="sm:hidden" />
              </>
            )}
            {menuActions.map((action, i) => (
              <span key={i}>
                {action.separator && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`gap-2 text-xs ${variantClasses[action.variant || "default"]}`}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              </span>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* If no menu actions, show inline actions in a dropdown on mobile */}
      {menuActions.length === 0 && inlineActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="sm:hidden inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {inlineActions.map((action, i) => (
              <DropdownMenuItem
                key={i}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`gap-2 text-xs ${variantClasses[action.variant || "default"]}`}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
