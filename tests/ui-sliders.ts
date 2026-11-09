import type { Locator } from 'playwright';

export async function setSlider(control: Locator, value: number): Promise<void> {
  await control.evaluate((element, number) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, String(number));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
