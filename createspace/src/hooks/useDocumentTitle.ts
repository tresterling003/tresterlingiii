import { useEffect } from 'react';

/** Set the browser tab title for the current page. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · CreateSpace` : 'CreateSpace — Make space for creativity';
  }, [title]);
}
