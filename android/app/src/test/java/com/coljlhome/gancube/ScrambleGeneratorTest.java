package com.coljlhome.gancube;

import cs.min2phase.Tools;
import java.util.Random;
import org.junit.Test;
import static org.junit.Assert.*;

public class ScrambleGeneratorTest {
    @Test public void scrambleReconstructsTheSampledRandomState() {
        for (int seed = 0; seed < 4; seed++) {
            String expected = Tools.randomCube(new Random(seed));
            String scramble = new ScrambleGenerator(new Random(seed)).generate();
            assertTrue(scramble, scramble.matches("[URFDLB][2']?( [URFDLB][2']?){1,20}"));
            assertEquals(expected, Tools.fromScramble(scramble));
            assertEquals(0, Tools.verify(Tools.fromScramble(scramble)));
        }
    }
    @Test public void distanceFilterRejectsSolvedAndEverySingleTurnState() {
        assertTrue(ScrambleGenerator.isTooEasy(Tools.fromScramble("")));
        for (char face : "URFDLB".toCharArray()) {
            for (String suffix : new String[]{"", "2", "'"}) assertTrue(ScrambleGenerator.isTooEasy(Tools.fromScramble(face + suffix)));
        }
        assertFalse(ScrambleGenerator.isTooEasy(Tools.fromScramble("R U")));
    }
}
