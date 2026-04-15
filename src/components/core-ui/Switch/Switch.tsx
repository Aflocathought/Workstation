import { Component } from 'solid-js';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: Component<SwitchProps> = (props) => {
  return (
    <label class={styles.switch} classList={{ [styles.disabled]: props.disabled }}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class={styles.slider}></span>
    </label>
  );
};