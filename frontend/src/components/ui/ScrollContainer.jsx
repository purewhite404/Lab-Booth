// frontend/src/components/ui/ScrollContainer.jsx
export default function ScrollContainer({
  header,
  children,
  footer,
  scrollable = true,
  bodyClassName = "",
}) {
  const bodyClasses = scrollable
    ? "flex-1 overflow-x-auto overflow-y-auto"
    : "flex-1";

  return (
    <div className="h-full flex flex-col">
      {header && <div className="flex-shrink-0 mb-2">{header}</div>}
      <div className={`${bodyClasses} ${bodyClassName}`}>{children}</div>
      {footer && <div className="flex-shrink-0 mt-4">{footer}</div>}
    </div>
  );
}
