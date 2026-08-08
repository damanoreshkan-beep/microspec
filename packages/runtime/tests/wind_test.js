

import { assertEquals } from "jsr:@std/assert@1";
import { fingeredSemitone, handCovered } from "../wind.js";


const SOPILKA = [11, 9, 7, 5, 4, 2, 0];                       
const fing = (s) => new Set([...s].map((c, i) => (c === "●" ? i : -1)).filter((i) => i >= 0));

Deno.test("fingeredSemitone: the diatonic staircase (all six covered → tonic, lift from the bottom)", () => {
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);   
  assertEquals(fingeredSemitone(fing("●●●●●○"), SOPILKA), 2);   
  assertEquals(fingeredSemitone(fing("●●●●○○"), SOPILKA), 4);   
  assertEquals(fingeredSemitone(fing("●●●○○○"), SOPILKA), 5);   
  assertEquals(fingeredSemitone(fing("●●○○○○"), SOPILKA), 7);   
  assertEquals(fingeredSemitone(fing("●○○○○○"), SOPILKA), 9);   
  assertEquals(fingeredSemitone(fing("○○○○○○"), SOPILKA), 11);  
});

Deno.test("fingeredSemitone: a fork flattens — the canonical cross-fingering", () => {
  assertEquals(fingeredSemitone(fing("○●●○○○"), SOPILKA), 10);
  assertEquals(fingeredSemitone(fing("●●●●○●"), SOPILKA), 3);   
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);   
  assertEquals(fingeredSemitone(fing("●○●●●●"), SOPILKA), 8);   
});

Deno.test("fingeredSemitone: only holes BELOW the first opening fork it", () => {
  assertEquals(fingeredSemitone(fing("●●○●○○"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●○●●●"), SOPILKA), 6);
  assertEquals(fingeredSemitone(fing("●●●●●●"), SOPILKA), 0);
  assertEquals(fingeredSemitone(new Set([0]), [7, 5, 0]), 5);   
});

Deno.test("handCovered: one finger must play the scale — the bug that made the pipe sound one note", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([5]), 0);    
  assertEquals(semi([4]), 2);    
  assertEquals(semi([3]), 4);    
  assertEquals(semi([2]), 5);    
  assertEquals(semi([1]), 7);    
  assertEquals(semi([0]), 9);    
  assertEquals(semi([]), 11);    

  assertEquals(fingeredSemitone(new Set([5]), SOPILKA), 10);
  assertEquals(fingeredSemitone(new Set([3]), SOPILKA), 10);
});

Deno.test("handCovered: a second finger below the first is a fork, not a re-stack", () => {
  const semi = (touched) => fingeredSemitone(handCovered(touched), SOPILKA);
  assertEquals(semi([0, 2]), 8);   
  assertEquals(semi([1, 3]), 6);   
  assertEquals(semi([3, 5]), 3);   
  assertEquals(semi([3, 1]), semi([1, 3]));
});
