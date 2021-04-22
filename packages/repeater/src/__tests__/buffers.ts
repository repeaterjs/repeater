import {DroppingBuffer, FixedBuffer, SlidingBuffer} from "../repeater";

describe("RepeaterBuffer", () => {
	test("FixedBuffer", () => {
		const buffer = new FixedBuffer(2);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		buffer.add(1);
		expect([buffer.empty, buffer.full]).toEqual([false, false]);
		buffer.add(2);
		expect([buffer.empty, buffer.full]).toEqual([false, true]);
		expect(() => buffer.add(3)).toThrow();
		expect(buffer.remove()).toEqual(1);
		expect([buffer.empty, buffer.full]).toEqual([false, false]);
		expect(buffer.remove()).toEqual(2);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		expect(() => buffer.remove()).toThrow();
	});

	test("SlidingBuffer", () => {
		const buffer = new SlidingBuffer(2);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		buffer.add(1);
		buffer.add(2);
		buffer.add(3);
		buffer.add(4);
		buffer.add(5);
		expect([buffer.empty, buffer.full]).toEqual([false, false]);
		expect(buffer.remove()).toEqual(4);
		expect(buffer.remove()).toEqual(5);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		expect(() => buffer.remove()).toThrow();
	});

	test("DroppingBuffer", () => {
		const buffer = new DroppingBuffer(2);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		buffer.add(1);
		buffer.add(2);
		buffer.add(3);
		buffer.add(4);
		buffer.add(5);
		expect([buffer.empty, buffer.full]).toEqual([false, false]);
		expect(buffer.remove()).toEqual(1);
		expect(buffer.remove()).toEqual(2);
		expect([buffer.empty, buffer.full]).toEqual([true, false]);
		expect(() => buffer.remove()).toThrow();
	});
});
