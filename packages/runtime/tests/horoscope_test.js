
import { assertEquals } from "jsr:@std/assert@1";
import { sunSign } from "../horoscope.js";

Deno.test("horoscope sunSign: cutoffs map month/day to the right sign, wrapping at year end", () => {
  assertEquals(sunSign(1, 1), 9);    
  assertEquals(sunSign(1, 19), 9);   
  assertEquals(sunSign(1, 20), 10);  
  assertEquals(sunSign(3, 20), 11);  
  assertEquals(sunSign(3, 21), 0);   
  assertEquals(sunSign(7, 23), 4);   
  assertEquals(sunSign(12, 21), 8);  
  assertEquals(sunSign(12, 22), 9);  
});
