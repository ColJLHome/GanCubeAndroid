package com.coljlhome.gancube;

import cs.min2phase.SearchWCA;
import cs.min2phase.Tools;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;

/** Thin adapter over TNoodle's unmodified 3x3 engine; no other puzzle or SVG libraries. */
public final class ScrambleGenerator {
    private static final Set<String> TOO_EASY = easyStates();
    private final Random random;
    private final SearchWCA search = new SearchWCA();

    public ScrambleGenerator() { this(new SecureRandom()); }
    ScrambleGenerator(Random random) { this.random = random; }

    public synchronized String generate() {
        String state;
        // Same minimum distance as TNoodle's default 3x3 puzzle: at least two
        // face turns from solved. Sample states, rather than random move sequences.
        do { state = Tools.randomCube(random); } while (TOO_EASY.contains(state));
        // Match TNoodle's 21-move limit, 60s timeout and 200ms optimization budget.
        String scramble = search.solution(state, 21, 60000, 200, SearchWCA.INVERSE_SOLUTION)
            .trim().replaceAll("\\s+", " ");
        if (!scramble.matches("[URFDLB][2']?( [URFDLB][2']?){1,20}")) {
            throw new IllegalStateException("3x3 scramble generation failed: " + scramble);
        }
        return scramble;
    }

    static boolean isTooEasy(String state) { return TOO_EASY.contains(state); }
    private static Set<String> easyStates() {
        Set<String> states = new HashSet<>();
        states.add(Tools.fromScramble(""));
        for (char face : "URFDLB".toCharArray()) {
            for (String suffix : new String[]{"", "2", "'"}) states.add(Tools.fromScramble(face + suffix));
        }
        return states;
    }
}
