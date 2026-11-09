import { EmptyState } from '../components/States';

export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <EmptyState title="Not built yet">This page is part of the next milestone.</EmptyState>
    </>
  );
}
