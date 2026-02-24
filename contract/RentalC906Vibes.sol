 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title RentalC906VibesV6
/// @notice Crypto-only booking contract for 3 independent rental units (with booking IDs)
contract RentalC906VibesV6 is ReentrancyGuard {
    // ------------------------
    // Config
    // ------------------------
    address public owner;
    bool public paused;
    uint256 public maticPerUSD;

    uint256 public constant DEPOSIT_USD = 50;
    uint256 public constant NIGHTLY_USD = 35;
    uint256 public constant UNIT_COUNT = 3;

    uint256 private nextBookingId = 1; // unique booking ID counter

    // ------------------------
    // Booking model
    // ------------------------
    struct Booking {
        uint256 id;
        address renter;
        uint256 unitId;
        uint256 startDay;
        uint256 nights;
        uint256 amountPaid;
        uint256 depositWeiAtBooking;
        uint256 nightlyWeiAtBooking;
        bool active;
    }

    // unitId => array of bookings
    mapping(uint256 => Booking[]) private unitBookings;

    // bookingId => Booking
    mapping(uint256 => Booking) public bookingsById;

    // renter => bookingIds[]
    mapping(address => uint256[]) public renterBookings;

    // unitId => day => booked?
    mapping(uint256 => mapping(uint256 => bool)) public isDateBooked;

    // ------------------------
    // Events
    // ------------------------
    event BookingCreated(
        uint256 indexed bookingId,
        uint256 indexed unitId,
        address indexed renter,
        uint256 startDay,
        uint256 nights,
        uint256 amountPaid
    );

    event BookingCancelled(
        uint256 indexed bookingId,
        uint256 indexed unitId,
        address indexed renter,
        uint256 refundAmount,
        bool late
    );

    event OwnerCancelledBooking(
        uint256 indexed bookingId,
        uint256 indexed unitId,
        address indexed renter,
        uint256 refundAmount
    );

    event OwnerWithdraw(address indexed to, uint256 amount);
    event MaticPerUSDUpdated(uint256 oldRate, uint256 newRate);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------------
    // Modifiers
    // ------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier validUnit(uint256 unitId) {
        require(unitId >= 1 && unitId <= UNIT_COUNT, "invalid unitId");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    // ------------------------
    // Constructor
    // ------------------------
    constructor(uint256 _maticPerUSD) {
        require(_maticPerUSD > 0, "invalid rate");
        owner = msg.sender;
        maticPerUSD = _maticPerUSD;
    }

    // ------------------------
    // Pricing helpers
    // ------------------------
    function _depositWei() public view returns (uint256) {
        return DEPOSIT_USD * maticPerUSD;
    }

    function _nightlyWei() public view returns (uint256) {
        return NIGHTLY_USD * maticPerUSD;
    }

    function priceFor(uint256 nights) public view returns (uint256 totalWei) {
        totalWei = _depositWei() + (_nightlyWei() * nights);
    }

    // ------------------------
    // Public view helpers
    // ------------------------
    function checkIsDateBooked(uint256 unitId, uint256 dayNumber) external view validUnit(unitId) returns (bool) {
        return isDateBooked[unitId][dayNumber];
    }

    function getBookingsForUnit(uint256 unitId) external view validUnit(unitId) returns (Booking[] memory) {
        return unitBookings[unitId];
    }

    function getRenterBookings(address renter) external view returns (uint256[] memory) {
        return renterBookings[renter];
    }

    function viewBooking(uint256 bookingId) external view returns (Booking memory) {
        require(bookingsById[bookingId].id != 0, "invalid bookingId");
        return bookingsById[bookingId];
    }

    /// @notice Returns all booked UTC days for a given unit (for frontend calendar)
   function getBookedDays(uint256 unitId)
    external
    view
    validUnit(unitId)
    returns (uint256[] memory)
{
    uint256 totalDays;
    for (uint256 i = 0; i < unitBookings[unitId].length; i++) {
        if (unitBookings[unitId][i].active) {
            totalDays += unitBookings[unitId][i].nights;
        }
    }

    uint256[] memory bookedDays = new uint256[](totalDays);
    uint256 index = 0;

    for (uint256 i = 0; i < unitBookings[unitId].length; i++) {
        Booking memory b = unitBookings[unitId][i];
        if (b.active) {
            for (uint256 j = 0; j < b.nights; j++) {
                bookedDays[index++] = b.startDay + j;
            }
        }
    }

    return bookedDays;
}
    // ------------------------
    // Booking
    // ------------------------
    function bookRental(
        uint256 unitId,
        uint256 startTimestamp,
        uint256 nights
    ) external payable validUnit(unitId) whenNotPaused nonReentrant returns (uint256 bookingId) {
        require(nights > 0, "nights must be > 0");
        require(startTimestamp >= block.timestamp, "start must be now or future");

        uint256 startDay = startTimestamp / 1 days;

        uint256 nightlyWeiNow = _nightlyWei();
        uint256 depositWeiNow = _depositWei();
        uint256 required = depositWeiNow + (nightlyWeiNow * nights);
        require(msg.value == required, "incorrect payment");

        // check availability only for selected unit
        for (uint256 i = 0; i < nights; i++) {
            uint256 day = startDay + i;
            require(!isDateBooked[unitId][day], "date already booked");
        }

        // reserve days
        for (uint256 i = 0; i < nights; i++) {
            isDateBooked[unitId][startDay + i] = true;
        }

        bookingId = nextBookingId++;
        Booking memory b = Booking({
            id: bookingId,
            renter: msg.sender,
            unitId: unitId,
            startDay: startDay,
            nights: nights,
            amountPaid: msg.value,
            depositWeiAtBooking: depositWeiNow,
            nightlyWeiAtBooking: nightlyWeiNow,
            active: true
        });

        unitBookings[unitId].push(b);
        bookingsById[bookingId] = b;
        renterBookings[msg.sender].push(bookingId);

        emit BookingCreated(bookingId, unitId, msg.sender, startDay, nights, msg.value);
    }

    // ------------------------
    // Cancellation
    // ------------------------
    function cancelBooking(uint256 bookingId) external nonReentrant whenNotPaused {
        Booking storage b = bookingsById[bookingId];
        require(b.active, "not active");
        require(b.renter == msg.sender, "not renter");

        uint256 startTimestamp = b.startDay * 1 days;
        require(block.timestamp < startTimestamp, "booking already started");

        uint256 refundAmount;
        bool late;

        if (startTimestamp >= block.timestamp + 24 hours) {
            refundAmount = b.amountPaid;
            late = false;
        } else {
            refundAmount = b.nights * b.nightlyWeiAtBooking;
            late = true;
        }

        b.active = false;
        for (uint256 i = 0; i < b.nights; i++) {
            isDateBooked[b.unitId][b.startDay + i] = false;
        }

        if (refundAmount > 0) {
            (bool sent, ) = msg.sender.call{value: refundAmount}("");
            require(sent, "refund failed");
        }

        emit BookingCancelled(bookingId, b.unitId, msg.sender, refundAmount, late);
    }

    function ownerCancelBooking(uint256 bookingId, uint256 refundAmount)
        external
        onlyOwner
        nonReentrant
    {
        Booking storage b = bookingsById[bookingId];
        require(b.active, "not active");

        b.active = false;
        for (uint256 i = 0; i < b.nights; i++) {
            isDateBooked[b.unitId][b.startDay + i] = false;
        }

        if (refundAmount > 0) {
            require(refundAmount <= b.amountPaid, "refund > paid");
            require(refundAmount <= address(this).balance, "insufficient balance");
            (bool sent, ) = b.renter.call{value: refundAmount}("");
            require(sent, "refund failed");
        }

        emit OwnerCancelledBooking(bookingId, b.unitId, b.renter, refundAmount);
    }

    // ------------------------
    // Owner actions
    // ------------------------
    function setMaticPerUSD(uint256 newRate) external onlyOwner {
        require(newRate > 0, "invalid rate");
        uint256 old = maticPerUSD;
        maticPerUSD = newRate;
        emit MaticPerUSDUpdated(old, newRate);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "invalid address");
        require(amount <= address(this).balance, "insufficient balance");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "withdraw failed");
        emit OwnerWithdraw(to, amount);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "invalid owner");
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    // ------------------------
    // Fallback
    // ------------------------
    receive() external payable {}
    fallback() external payable {}
}
