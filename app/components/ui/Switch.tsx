import React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { classNames } from '~/utils/classNames';

// Define the props for the custom Switch component
// Add the optional 'disabled' property
interface SwitchProps extends RadixSwitch.SwitchProps {
  disabled?: boolean;
}

// Updated Switch component implementation
const Switch = React.forwardRef<
  React.ElementRef<typeof RadixSwitch.Root>,
  SwitchProps
>(({ className, disabled, ...props }, ref) => (
  <RadixSwitch.Root
    className={classNames(
      // Base styles (layout, focus, transitions, disabled state)
      'peer inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      // REMOVED default color styles: data-[state=checked]:bg-primary data-[state=unchecked]:bg-input
      // Apply className last to allow overrides for colors, size, etc.
      className
    )}
    {...props}
    ref={ref}
    disabled={disabled}
  >
    <RadixSwitch.Thumb
      // Base thumb styles
      className={classNames(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
      )}
    />
  </RadixSwitch.Root>
));
Switch.displayName = RadixSwitch.Root.displayName;

export { Switch };
