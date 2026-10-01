import { Page } from 'playwright';

export interface InteractiveElement {
  id: number;
  tagName: string;
  type?: string;
  text: string;
  placeholder?: string;
  ariaLabel?: string;
}

export async function getInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  return await page.evaluate(() => {
    const selectors = 'a, button, input, select, textarea, [role="button"], [onclick]';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
    
    let idCounter = 1;
    const result: InteractiveElement[] = [];

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
      
      if (!isVisible) return;

      // Tag element in the DOM for Playwright targeting
      el.setAttribute('data-agent-id', idCounter.toString());

      result.push({
        id: idCounter,
        tagName: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        text: (el.innerText || el.getAttribute('value') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        placeholder: el.getAttribute('placeholder') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined
      });

      idCounter++;
    });

    return result;
  });
}