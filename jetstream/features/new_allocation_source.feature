Feature: Testing a story

  Scenario: New Allocation Source

    Given TAS Api has a new Allocation Source
    |  name                       |  compute allowed   |   start date   | source id |
    |  DefaultAllocationSource    |  250               |   current      | 1234      |

    And Users are a part of the allocation source
    |  username    |
    |  amitj       |
    |  julianp     |

    When monitor_allocation_source task is run

    And User launch Instance
    | username    | cpu | instance id  | start date |
    | amitj       |  1  |     1        |   current  |
    | julianp     |  2  |     2        |   current  |

    And User adds instance to allocation source
    | username      | instance id  |
    |  amitj        | 1            |
    |  julianp      | 2            |

    And User instance runs for some days
    | username     | instance id  | days  | status       |
    | amitj        |      1       |   2   | active       |
    | julianp      |      2       |   4   | active       |

    Then Allocation Source is in the Model

    And Creation Event is Fired

    And Compute Allocated Changed Event is Fired

    And update_snapshot calculates correct compute_used in UserAllocationSnapshot
    |  username    |  number of times update_snapshot runs   |  time between runs in minutes  | total compute used   |
    |   amitj      |   4                                     |              15                |     1                |
    |   julianp    |   4                                     |              15                |     2                |

    When Allocation Source is renewed in TAS Api
    |  name                       |  compute allowed   |   days after original start date    | new source id |
    |  DefaultAllocationSource    |  200               |   1                                 | 1235          |

    And monitor_allocation_source task is run

    Then Renewal Event is Fired

    And Compute Allocated Changed Event is Fired

    And update_snapshot calculates correct compute_used in UserAllocationSnapshot
    |  username    |  number of times update_snapshot runs   |  time between runs in minutes  | total compute used   |
    |   amitj      |   4                                     |              15                |     1                |
    |   julianp    |   4                                     |              15                |     2                |

    When