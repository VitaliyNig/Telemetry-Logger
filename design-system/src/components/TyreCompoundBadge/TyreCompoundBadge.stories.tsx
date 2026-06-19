import type { Meta, StoryObj } from "@storybook/react-vite";
import { TyreCompoundBadge } from "./TyreCompoundBadge";

const meta: Meta<typeof TyreCompoundBadge> = {
  title: "Atoms/TyreCompoundBadge",
  component: TyreCompoundBadge,
  argTypes: {
    shape: { control: "inline-radio", options: ["square", "circle"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
  args: { compound: 16, shape: "square" },
};
export default meta;

type Story = StoryObj<typeof TyreCompoundBadge>;

// Real Singapore Q1 grid: actualTyreCompound 16 (C5/Soft) was the fitted set
// for most cars during the session (`packets.CarStatus.carStatusDataItems[*]`).
export const Square: Story = {};
export const Circle: Story = { args: { shape: "circle", size: "md" } };

export const AllCompounds: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {[16, 17, 18, 19, 7, 8].map((c) => (
        <TyreCompoundBadge key={c} compound={c} shape="circle" size="md" />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <TyreCompoundBadge compound={16} shape="circle" size="sm" />
      <TyreCompoundBadge compound={16} shape="circle" size="md" />
      <TyreCompoundBadge compound={16} shape="circle" size="lg" />
    </div>
  ),
};
