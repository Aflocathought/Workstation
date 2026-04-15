import { Component, For } from 'solid-js';
import styles from './Select.module.css';

export interface SelectOption {
  label: string;
  value: string | number;
}

export interface SelectProps {
  value: string | number;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const Select: Component<SelectProps> = (props) => {
  return (
    <select
      class={styles.select}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value)}
    >
      <For each={props.options}>
        {(option) => <option value={option.value}>{option.label}</option>}
      </For>
    </select>
  );
};