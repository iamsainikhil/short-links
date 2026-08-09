import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Icon icon="line-md:sunny-outline-to-moon-loop-transition" className="!size-6" />
      ) : (
        <Icon icon="line-md:moon-to-sunny-outline-loop-transition" className="!size-6" />
      )}
    </Button>
  );
}