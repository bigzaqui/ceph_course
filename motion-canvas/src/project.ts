import { makeProject } from '@motion-canvas/core';

import scene1 from './scenes/scene1_what_is_ceph?scene';
import scene2 from './scenes/scene2_rados?scene';
import scene3 from './scenes/scene3_osds?scene';
import scene4 from './scenes/scene4_monitors?scene';
import scene5 from './scenes/scene5_mds?scene';
import scene6 from './scenes/scene6_crush?scene';
import scene7 from './scenes/scene7_pools_pgs?scene';
import scene8 from './scenes/scene8_direct_path?scene';

export default makeProject({
  name: 'Ceph & CephFS — Motion Canvas Course',
  scenes: [
    scene1,
    scene2,
    scene3,
    scene4,
    scene5,
    scene6,
    scene7,
    scene8,
  ],
});
